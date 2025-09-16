import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseAlipayCsv, AlipayParseResult } from "@/lib/alipay";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface ImportAlipayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

const ImportAlipayDialog = ({ open, onOpenChange, onImported }: ImportAlipayDialogProps) => {
  const [result, setResult] = useState<AlipayParseResult | null>(null);
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
      const parsed = await parseAlipayCsv(file);
      setResult(parsed);
      if (!parsed.rows.length) {
        toast({ title: "未解析到记录", description: "请检查文件内容是否正确" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 移动端常见问题：iOS 不支持 GBK/GB18030 解码的 CSV。请改用 XLSX 或导出 UTF-8 CSV。
      toast({ title: "解析失败", description: `${message}（建议在手机上使用 UTF-8 CSV 或 XLSX 导出）`, variant: "destructive" });
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
    // Prefer an existing Alipay or cash account
    const alipay = accounts.find(a => a.type === 'alipay' || a.name.includes('支付宝'));
    if (alipay) return alipay.id;
    const cash = accounts.find(a => a.type === 'cash' || a.name.includes('现金'));
    return (cash || accounts[0]).id;
  };

  const pickCategoryName = (alipayCategory: string, type: 'income' | 'expense') => {
    if (type === 'income') return '工资';
    // expense mapping
    if (alipayCategory.includes('餐饮')) return '餐饮';
    if (alipayCategory.includes('交通')) return '交通';
    if (alipayCategory.includes('服饰') || alipayCategory.includes('购物')) return '其他';
    return '其他';
  };

  const resolveCategoryId = async (userId: string, name: string, type: 'income' | 'expense') => {
    // Try find existing
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('name', name)
      .limit(1);
    if (error) throw error;
    if (categories && categories.length > 0) return categories[0].id;
    // Create if not exists
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

      // 1) 批量准备分类映射，避免逐条网络请求
      const needPairs = new Set<string>();
      for (const rec of result.records) {
        const type = rec['收/支'] === '收入' ? 'income' : rec['收/支'] === '支出' ? 'expense' : 'transfer';
        if (type === 'transfer') continue;
        const catName = pickCategoryName(rec['交易分类'], type);
        needPairs.add(`${type}:${catName}`);
      }
      const needed = Array.from(needPairs).map(k => ({ type: k.split(':')[0] as 'income'|'expense', name: k.split(':')[1] }));
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

      // Build rows for insertion with de-dup fingerprint; skip transfers
      const toInsert: any[] = [];
      const uniqSet = new Set<string>();
      const normalizeDateTime = (s: string | undefined) => {
        if (!s) return '';
        const v = s.trim().replace(/\//g, '-').replace('T', ' ');
        const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[\s]+(\d{2}:\d{2}:\d{2}))/);
        if (m) return `${m[1]} ${m[2]}`;
        const m2 = v.match(/^(\d{4}-\d{2}-\d{2})(?:[\s]+(\d{2}:\d{2}))/);
        if (m2) return `${m2[1]} ${m2[2]}:00`;
        return `${s.slice(0,10)} 00:00:00`;
      };
      for (const rec of result.records) {
        const type = rec['收/支'] === '收入' ? 'income' : rec['收/支'] === '支出' ? 'expense' : 'transfer';
        if (type === 'transfer') continue; // skip 不计收支

        const catName = pickCategoryName(rec['交易分类'], type);
        const categoryId = byKey.get(`${type}:${catName}`)!;
        const occurredAt = normalizeDateTime(rec['交易时间']);
        const dateStr = occurredAt ? occurredAt.slice(0,10) : format(new Date(), 'yyyy-MM-dd');
        const amount = Number(rec['金额'] || 0);
        const desc = rec['商品说明'] || rec['交易对方'] || '';
        const tradeId = rec['交易订单号'] || '';
        const merchantId = rec['商家订单号'] || '';
        const fingerprint = `alipay|${occurredAt || dateStr}|${Math.round(amount*100)}|${desc}|${tradeId}|${merchantId}`;
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
          source: 'alipay',
        });

      }

      if (toInsert.length === 0) {
        toast({ title: '没有可导入的记录', description: '已跳过不计收支' });
        return;
      }

      // Filter out rows already imported (by description+amount+date)
      const existingTransactions = await supabase
        .from('transactions')
        .select('description, amount, date')
        .eq('user_id', userId);

      const existingHashes = new Set(
        existingTransactions.data?.map(t => `${t.description}-${t.amount}-${t.date}`) || []
      );

      const newRows = toInsert.filter(r => {
        const hash = `${r.description}-${r.amount}-${r.date}`;
        return !existingHashes.has(hash);
      });
      if (newRows.length === 0) {
        toast({ title: '没有可导入的新记录', description: '系统已自动忽略重复交易' });
        return;
      }

      // 分片插入
      const chunk = 500;
      for (let i=0;i<newRows.length;i+=chunk) {
        const seg = newRows.slice(i, i+chunk);
        const { error: insErr } = await supabase.from('transactions').insert(seg);
        if (insErr) throw insErr;
      }

      // Recompute delta only from new rows
      const delta = newRows.reduce((sum, r) => sum + (r.type === 'income' ? r.amount : -r.amount), 0);

      // Update account balance if any delta
      if (delta !== 0) {
        // Fetch current balance
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

      toast({ title: `导入成功`, description: `已导入 ${newRows.length} 条新记录（重复已忽略）` });
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
      <DialogContent className="max-w-[95vw] sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>导入支付宝账单（CSV）</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Input type="file" accept=".csv" onChange={onFileChange} />
            {fileName && (
              <div className="text-xs text-muted-foreground">文件：{fileName}</div>
            )}
            <div className="text-xs text-muted-foreground">
              支持支付宝导出的CSV，自动识别GB18030/GBK编码并解析表头至全部12列。
            </div>
          </div>

          {loading && (
            <div className="text-sm">解析中，请稍候…</div>
          )}

          {result && (
            <div className="text-sm text-muted-foreground">
              已解析 {result.rows.length} 条记录（将跳过“不计收支”）
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

export default ImportAlipayDialog;
