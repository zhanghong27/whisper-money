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
    if (alipayCategory.includes('服饰') || alipayCategory.includes('购物')) return '购物';
    return '购物';
  };

  const resolveCategoryId = async (userId: string, name: string, type: 'income' | 'expense') => {
    // Try find existing
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
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

      // Build rows for insertion; skip transfers
      const toInsert: any[] = [];
      let delta = 0; // will adjust account balance
      for (const rec of result.records) {
        const type = rec['收/支'] === '收入' ? 'income' : rec['收/支'] === '支出' ? 'expense' : 'transfer';
        if (type === 'transfer') continue; // skip 不计收支

        const catName = pickCategoryName(rec['交易分类'], type);
        const categoryId = await resolveCategoryId(userId, catName, type);
        const dateStr = rec['交易时间']?.slice(0, 10) || format(new Date(), 'yyyy-MM-dd');
        const amount = Number(rec['金额'] || 0);
        const desc = rec['商品说明'] || rec['交易对方'] || '';

        toInsert.push({
          user_id: userId,
          account_id: accountId,
          category_id: categoryId,
          amount,
          type,
          date: dateStr,
          description: desc,
        });

        if (type === 'income') delta += amount;
        if (type === 'expense') delta -= amount;
      }

      if (toInsert.length === 0) {
        toast({ title: '没有可导入的记录', description: '已跳过不计收支' });
        return;
      }

      const { error: insErr } = await supabase.from('transactions').insert(toInsert);
      if (insErr) throw insErr;

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
