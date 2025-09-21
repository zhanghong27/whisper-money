import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseWechatFile, wechatAmountToNumber, mapWechatTypeToTransaction, WechatParseResult } from "@/lib/wechat";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface ImportWechatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

const ImportWechatDialog = ({ open, onOpenChange, onImported }: ImportWechatDialogProps) => {
  const [result, setResult] = useState<WechatParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    try {
      const parsed = await parseWechatFile(file);
      setResult(parsed);
      if (!parsed.rows.length) {
        toast({ title: "未解析到记录", description: "请检查文件内容是否正确" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "解析失败", description: message, variant: "destructive" });
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const resolveAccountId = async (userId: string) => {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .limit(50);
    if (error) throw error;
    if (!accounts || accounts.length === 0) throw new Error('未找到任何账户');
    // 优先匹配微信账户
    const wechat = accounts.find(a => a.name.includes('微信') || a.name.includes('WeChat'));
    if (wechat) return wechat.id;
    // 如果没有微信账户，返回第一个账户而不是现金
    return accounts[0].id;
  };

  const pickCategoryName = (wxType: string, type: 'income' | 'expense') => {
    if (type === 'income') return '工资';
    if (wxType.includes('消费') || wxType.includes('商户')) return '其他';
    if (wxType.includes('转账')) return '其他';
    return '其他';
  };

  const resolveCategoryId = async (userId: string, name: string, type: 'income' | 'expense') => {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('name', name)
      .limit(1);
    if (error) throw error;
    if (categories && categories.length > 0) return categories[0].id;
    const { data, error: insErr } = await supabase
      .from('categories')
      .insert({ user_id: userId, name, type, icon: '📂', color: '#6B7280' })
      .select('id')
      .single();
    if (insErr) throw insErr;
    return data.id as string;
  };

  const onImport = async () => {
    if (!result || result.records.length === 0) return;
    setImporting(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) throw new Error('用户未登录');
      const userId = userData.user.id;

      const accountId = await resolveAccountId(userId);

      // 1) 预计算本次导入所需的分类集合，批量解析/创建，避免逐条请求
      const needPairs = new Set<string>(); // key: `${type}:${name}`
      for (const rec of result.records) {
        const type = mapWechatTypeToTransaction(rec['收/支']);
        if (type === 'transfer') continue;
        const catName = pickCategoryName(rec['交易类型'], type);
        needPairs.add(`${type}:${catName}`);
      }
      const needed = Array.from(needPairs).map(k => ({ type: k.split(':')[0] as 'income'|'expense', name: k.split(':')[1] }));
      // 拉全量用户分类到内存做映射（通常数量不大）
      const { data: allCats, error: catsErr } = await supabase
        .from('categories')
        .select('id,name,type')
        .eq('user_id', userId)
;
      if (catsErr) throw catsErr;
      const byKey = new Map<string,string>();
      (allCats||[]).forEach(c => byKey.set(`${c.type}:${c.name}`, c.id));
      const missing = needed.filter(p => !byKey.has(`${p.type}:${p.name}`));
      if (missing.length) {
        const { data: inserted, error: insCatErr } = await supabase
          .from('categories')
          .insert(missing.map(m => ({ user_id: userId, name: m.name, type: m.type, icon: '📂', color: '#6B7280' })))
          .select('id,name,type');
        if (insCatErr) throw insCatErr;
        (inserted||[]).forEach(c => byKey.set(`${c.type}:${c.name}`, c.id));
      }

      const toInsert: any[] = [];
      const uniqSet = new Set<string>();
      const normalizeDateTime = (s: string | undefined) => {
        if (!s) return '';
        const v = s.trim().replace(/\//g, '-').replace('T', ' ');
        // keep 'YYYY-MM-DD HH:mm:ss' if present
        const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[\s]+(\d{2}:\d{2}:\d{2}))/);
        if (m) return `${m[1]} ${m[2]}`;
        // try 'YYYY-MM-DD HH:mm'
        const m2 = v.match(/^(\d{4}-\d{2}-\d{2})(?:[\s]+(\d{2}:\d{2}))/);
        if (m2) return `${m2[1]} ${m2[2]}:00`;
        return `${v.slice(0,10)} 00:00:00`;
      };

      for (const rec of result.records) {
        const type = mapWechatTypeToTransaction(rec['收/支']);
        if (type === 'transfer') continue; // 跳过中性/未知
        const catName = pickCategoryName(rec['交易类型'], type);
        const categoryId = byKey.get(`${type}:${catName}`)!;
        const occurredAt = normalizeDateTime(rec['交易时间']);
        const dateStr = occurredAt ? occurredAt.slice(0, 10) : format(new Date(), 'yyyy-MM-dd');
        const amount = wechatAmountToNumber(rec['金额(元)']);
        const desc = rec['商品'] || rec['交易对方'] || '';
        const tradeId = rec['交易单号'] || '';
        const merchantId = rec['商户单号'] || '';
        const fingerprint = `wechat|${occurredAt || dateStr}|${Math.round(amount*100)}|${desc}|${tradeId}|${merchantId}`;
        if (uniqSet.has(fingerprint)) continue;
        uniqSet.add(fingerprint);

        toInsert.push({
          user_id: userId,
          account_id: accountId,
          category_id: categoryId,
          amount: type === 'income' ? amount : -amount,
          type,
          date: dateStr + ' 00:00:00',
          description: desc,
          source: 'wechat',
        });
      }
      if (toInsert.length === 0) {
        toast({ title: '没有可导入的记录', description: '已跳过中性/未知交易' });
        return;
      }

      const fps = toInsert.map(r => r.unique_hash);
      const { data: existed, error: exErr } = await supabase
        .from('transactions')
        .select('unique_hash')
        .eq('user_id', userId)
        .in('unique_hash', fps);
      if (exErr) throw exErr;
      const existedSet = new Set((existed || []).map(r => r.unique_hash));
      const newRows = toInsert.filter(r => !existedSet.has(r.unique_hash));
      if (newRows.length === 0) {
        toast({ title: '没有可导入的新记录', description: '系统已自动忽略重复交易' });
        return;
      }
      // 大批量分片插入，避免超限
      const chunk = 500;
      for (let i=0;i<newRows.length;i+=chunk) {
        const seg = newRows.slice(i, i+chunk);
        const { error: insErr } = await supabase.from('transactions').insert(seg);
        if (insErr) throw insErr;
      }

      const delta = newRows.reduce((sum, r) => sum + (r.type === 'income' ? r.amount : -r.amount), 0);
      if (delta !== 0) {
        const { data: accData, error: accErr } = await supabase
          .from('accounts')
          .select('id, balance')
          .eq('id', accountId)
          .single();
        if (accErr) throw accErr;
        const current = Number(accData?.balance ?? 0);
        const newBalance = current + delta;
        const { error: updErr } = await supabase
          .from('accounts')
          .update({ balance: newBalance })
          .eq('id', accountId);
        if (updErr) throw updErr;
      }

      toast({ title: `导入成功`, description: `已导入 ${toInsert.length} 条记录` });
      onImported?.();
      onOpenChange(false);
    } catch (err) {
      const pickMessage = (e: any) => {
        try {
          if (typeof e === 'string') return e;
          if (e?.message) return e.message;
          if (e?.details) return e.details;
          if (e?.error_description) return e.error_description;
          if (e?.error) return e.error;
          return JSON.stringify(e);
        } catch { return String(e); }
      };
      let message = pickMessage(err);
      if (/occurred_at|unique_hash/i.test(message)) {
        message += '。请先在 Supabase 为 transactions 添加 occurred_at/unique_hash 列，并创建 (user_id, unique_hash) 唯一索引后再试。';
      }
      toast({ title: '导入失败', description: message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>导入微信账单（CSV）</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Input type="file" accept=".csv,.xlsx" onChange={onFileChange} />
            {fileName && (
              <div className="text-xs text-muted-foreground">文件：{fileName}</div>
            )}
            <div className="text-xs text-muted-foreground">支持 CSV 或 XLSX（将自动识别并解析）</div>
          </div>
          {result && (
            <div className="text-sm text-muted-foreground">
              已解析 {result.rows.length} 条记录（将跳过中性/未知交易）
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
            <Button onClick={onImport} disabled={!result || importing}>
              {importing ? '导入中…' : '导入到交易'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportWechatDialog;
