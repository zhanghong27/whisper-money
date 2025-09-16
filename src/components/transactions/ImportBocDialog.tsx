import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseBocPdf, bocAmountToNumber, BocParseResult } from "@/lib/boc";
import { supabase } from "@/integrations/supabase/client";

interface ImportBocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

const ImportBocDialog = ({ open, onOpenChange, onImported }: ImportBocDialogProps) => {
  const [result, setResult] = useState<BocParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    try {
      setProgress('开始解析PDF…');
      const parsed = await parseBocPdf(file, password || undefined, (msg)=>setProgress(msg));
      setResult(parsed);
      if (!parsed.rows.length) {
        toast({ title: "未解析到记录", description: "请检查PDF与密码是否正确" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "解析失败", description: message, variant: "destructive" });
      setResult(null);
    } finally {
      setLoading(false);
      setProgress("");
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
    // 优先匹配中国银行账户
    const bank = accounts.find(a => a.name.includes('中国银行') || a.name.includes('中行') || a.name.includes('BOC'));
    if (bank) return bank.id;
    // 如果没有中国银行账户，返回第一个账户而不是现金
    return accounts[0].id;
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
      const toInsert: any[] = [];
      const uniqSet = new Set<string>();
      for (const rec of result.records) {
        // Determine amount and type
        let amt = 0; let type: 'income' | 'expense' = 'expense';
        const debit = bocAmountToNumber(rec.借方金额);
        const credit = bocAmountToNumber(rec.贷方金额);
        if (credit > 0) { amt = credit; type = 'income'; }
        else if (debit > 0) { amt = debit; type = 'expense'; }
        else {
          const v = bocAmountToNumber(rec.金额);
          amt = Math.abs(v);
          type = v >= 0 ? 'income' : 'expense';
        }
        if (!amt) continue;
        const catName = type === 'income' ? '工资' : '其他';
        const categoryId = await resolveCategoryId(userId, catName, type);
        const dateStr = rec.日期;
        const descParts = [rec.摘要, rec.对方信息].filter(Boolean);
        const description = descParts.join(' - ');
        const fingerprint = `boc|${dateStr} 00:00:00|${Math.round(amt*100)}|${description}`;
        if (uniqSet.has(fingerprint)) continue;
        uniqSet.add(fingerprint);

        toInsert.push({
          user_id: userId,
          account_id: accountId,
          category_id: categoryId,
          amount: type === 'income' ? amt : -amt,
          type,
          date: dateStr + ' 00:00:00',
          description,
          source: 'boc',
        });
      }
      if (toInsert.length === 0) {
        toast({ title: '没有可导入的记录' });
        return;
      }
      const fps = toInsert.map(r => `${r.description}-${r.amount}-${r.date}`);
      const existingTransactions = await supabase
        .from('transactions')
        .select('description, amount, date')
        .eq('user_id', userId);

      const existingHashes = new Set(
        existingTransactions.data?.map(t => `${t.description}-${t.amount}-${t.date}`) || []
      );

      const filtered = toInsert.filter(r => {
        const hash = `${r.description}-${r.amount}-${r.date}`;
        return !existingHashes.has(hash);
      });
      if (filtered.length === 0) {
        toast({ title: '没有可导入的新记录', description: '系统已自动忽略重复交易' });
        return;
      }
      for (let i=0;i<filtered.length;i+=500) {
        const seg = filtered.slice(i, i+500);
        const { error: insErr } = await supabase.from('transactions').insert(seg);
        if (insErr) throw insErr;
      }

      const delta = filtered.reduce((sum, r) => sum + (r.type === 'income' ? r.amount : -r.amount), 0);
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
          <DialogTitle>导入中国银行交易流水（PDF）</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm">PDF 密码</label>
            <Input
              type="text"
              placeholder="输入PDF密码（如：433242）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Input type="file" accept=".pdf" onChange={onFileChange} />
            {fileName && (
              <div className="text-xs text-muted-foreground">文件：{fileName}</div>
            )}
            <div className="text-xs text-muted-foreground">支持需密码的PDF；请先输入密码再选择文件。</div>
          </div>
          {result && (
            <div className="text-sm text-muted-foreground">
              已解析 {result.rows.length} 条记录
            </div>
          )}
          {progress && (
            <div className="text-xs text-muted-foreground">{progress}</div>
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

export default ImportBocDialog;
