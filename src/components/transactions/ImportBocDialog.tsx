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
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    try {
      const parsed = await parseBocPdf(file, password || undefined);
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
    }
  };

  const resolveAccountId = async (userId: string) => {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .limit(50);
    if (error) throw error;
    if (!accounts || accounts.length === 0) throw new Error('未找到任何账户');
    const bank = accounts.find(a => a.type === 'bank' || a.name.includes('中国银行') || a.name.includes('中行'));
    if (bank) return bank.id;
    const cash = accounts.find(a => a.type === 'cash' || a.name.includes('现金'));
    return (cash || accounts[0]).id;
  };

  const resolveCategoryId = async (userId: string, name: string, type: 'income' | 'expense') => {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
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
      let delta = 0;
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
        const catName = type === 'income' ? '工资' : '购物';
        const categoryId = await resolveCategoryId(userId, catName, type);
        const dateStr = rec.日期;
        const descParts = [rec.摘要, rec.对方信息].filter(Boolean);
        const description = descParts.join(' - ');
        toInsert.push({
          user_id: userId,
          account_id: accountId,
          category_id: categoryId,
          amount: amt,
          type,
          date: dateStr,
          description,
        });
        delta += type === 'income' ? amt : -amt;
      }
      if (toInsert.length === 0) {
        toast({ title: '没有可导入的记录' });
        return;
      }
      const { error: insErr } = await supabase.from('transactions').insert(toInsert);
      if (insErr) throw insErr;

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
      const message = err instanceof Error ? err.message : String(err);
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

