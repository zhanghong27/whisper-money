import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseCmbPdf, cmbAmountToNumber, CmbParseResult } from "@/lib/cmb";
import { supabase } from "@/integrations/supabase/client";
import { ToastAction } from "@/components/ui/toast";

interface ImportCmbDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

const ImportCmbDialog = ({ open, onOpenChange, onImported }: ImportCmbDialogProps) => {
  const [result, setResult] = useState<CmbParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
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
      const parsed = await parseCmbPdf(file, (msg) => setProgress(msg));
      setResult(parsed);
      if (!parsed.rows.length) {
        toast({ title: "未解析到记录", description: "请检查PDF是否为招商银行交易流水" });
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
    // 优先匹配招商银行账户
    const bank = accounts.find(a => a.name.includes('招商银行') || a.name.includes('招商') || a.name.includes('CMB'));
    if (bank) return bank.id;
    // 如果没有招商银行账户，返回第一个账户而不是现金
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
    if (categories && categories.length > 0) return { id: categories[0].id, created: false };
    const { data, error: insErr } = await supabase
      .from('categories')
      .insert({ user_id: userId, name, type, icon: '📂', color: '#6B7280', is_system: false })
      .select('id')
      .single();
    if (insErr) throw insErr;
    return { id: data.id as string, created: true };
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
      const createdCategoryIds: string[] = [];
      const toInsert: any[] = [];
      const uniqSet = new Set<string>();
      const toYmd = (s: string) => s.replace(/[^\d]/g, '').slice(0,8); // YYYYMMDD
      const moneyToFixed2 = (n: number) => {
        const sign = n < 0 ? '-' : '';
        return sign + Math.abs(n).toFixed(2);
      };
      for (const rec of result.records) {
        const amt = cmbAmountToNumber(rec['交易金额']);
        const type = amt >= 0 ? 'income' : 'expense';
        const amount = Math.abs(amt);
        const catName = type === 'income' ? '工资' : '其他';
        const catRes = await resolveCategoryId(userId, catName, type as 'income' | 'expense');
        const categoryId = catRes.id;
        if (catRes.created) createdCategoryIds.push(categoryId);
        const dateStr = rec['记账日期'];
        const desc = `${rec['交易摘要']}` + (rec['对手信息'] ? ` - ${rec['对手信息']}` : '');
        // New fingerprint: 记账日期(YYYYMMDD) + 带符号金额(两位小数) + 余额(两位小数)
        const signed = type === 'income' ? amount : -amount;
        const balanceNum = cmbAmountToNumber(rec['联机余额']);
        const ymd = toYmd(dateStr);
        const fingerprint = `${ymd}${moneyToFixed2(signed)}${moneyToFixed2(balanceNum)}`;
        if (uniqSet.has(fingerprint)) continue;
        uniqSet.add(fingerprint);

        toInsert.push({
          user_id: userId,
          account_id: accountId,
          category_id: categoryId,
          amount: type === 'income' ? amount : -amount,
          type,
          date: dateStr + ' 00:00:00',
          occurred_at: dateStr + ' 00:00:00',
          description: desc,
          source: 'cmb',
          unique_hash: fingerprint,
        });
      }
      if (toInsert.length === 0) {
        toast({ title: '没有可导入的记录' });
        return;
      }
      // Check existing: new fingerprint + legacy fingerprint + field-combo fallback
      const newFps = toInsert.map(r => r.unique_hash);
      const legacyFps = result.records.map(rec => {
        const amt = cmbAmountToNumber(rec['交易金额']);
        const type = amt >= 0 ? 'income' : 'expense';
        const amount = Math.abs(amt);
        const d = rec['记账日期'];
        const des = `${rec['交易摘要']}` + (rec['对手信息'] ? ` - ${rec['对手信息']}` : '');
        return `${d}|${Math.round(amount*100)}|${des}`;
      });

      const { data: existedByHash, error: hashErr } = await supabase
        .from('transactions')
        .select('unique_hash')
        .eq('user_id', userId)
        .in('unique_hash', Array.from(new Set([...newFps, ...legacyFps])));
      if (hashErr) throw hashErr;
      const existedHashSet = new Set((existedByHash || []).map(r => r.unique_hash));

      const { data: existedByFields, error: fieldsErr } = await supabase
        .from('transactions')
        .select('date, amount, description')
        .eq('user_id', userId);
      if (fieldsErr) throw fieldsErr;
      const existedFieldsSet = new Set((existedByFields || []).map(r => {
        const d = (r.date || '').toString().split(' ')[0];
        const cents = Math.round(Math.abs(Number(r.amount))*100);
        return `${d}|${cents}|${r.description || ''}`;
      }));

      const filtered = toInsert.filter(r => {
        if (existedHashSet.has(r.unique_hash)) return false;
        const d = r.date.split(' ')[0];
        const cents = Math.round(Math.abs(Number(r.amount))*100);
        const sig = `${d}|${cents}|${r.description || ''}`;
        return !existedFieldsSet.has(sig);
      });
      if (filtered.length === 0) {
        toast({ title: '没有可导入的新记录', description: '系统已自动忽略重复交易' });
        return;
      }
      const insertedIds: string[] = [];
      for (let i=0;i<filtered.length;i+=500) {
        const seg = filtered.slice(i, i+500);
        const { data: inserted, error: insErr } = await supabase
          .from('transactions').insert(seg).select('id');
        if (insErr) throw insErr;
        inserted?.forEach((row: any) => insertedIds.push(row.id));
      }

      const delta = filtered.reduce((sum, r) => sum + Number(r.amount), 0);
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

      let undone = false;
      toast({
        title: `导入成功`,
        description: `已导入 ${filtered.length} 条记录（5 秒内可撤回）`,
        duration: 5000,
        action: (
          <ToastAction altText="撤回" asChild>
            <button onClick={async () => {
              if (undone) return; undone = true;
              try {
                if (insertedIds.length) {
                  await supabase
                    .from('transactions')
                    .delete()
                    .in('id', insertedIds)
                    .eq('user_id', userId);
                }
                if (delta !== 0) {
                  const { data: accData, error: accErr } = await supabase
                    .from('accounts')
                    .select('id, balance')
                    .eq('id', accountId)
                    .single();
                  if (!accErr && accData) {
                    const current = Number(accData.balance || 0);
                    const revert = current - delta;
                    await supabase
                      .from('accounts')
                      .update({ balance: revert })
                      .eq('id', accountId);
                  }
                }
                // Remove newly created categories if now unused
                if (createdCategoryIds.length) {
                  const { data: catUse } = await supabase
                    .from('transactions')
                    .select('category_id')
                    .eq('user_id', userId)
                    .in('category_id', createdCategoryIds);
                  const used = new Set((catUse || []).map((r: any) => r.category_id));
                  const deletable = createdCategoryIds.filter(id => !used.has(id));
                  if (deletable.length) {
                    await supabase
                      .from('categories')
                      .delete()
                      .in('id', deletable)
                      .eq('user_id', userId)
                      .eq('is_system', false);
                  }
                }
                onImported?.();
                toast({ title: '已撤回导入', duration: 1000 });
              } catch (e) {
                toast({ title: '撤回失败', description: (e as any)?.message || String(e), variant: 'destructive', duration: 2000 });
              }
            }}>撤回</button>
          </ToastAction>
        )
      });
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
          <DialogTitle>导入招商银行交易流水（PDF）</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Input type="file" accept=".pdf" onChange={onFileChange} />
            {fileName && (
              <div className="text-xs text-muted-foreground">文件：{fileName}</div>
            )}
            <div className="text-xs text-muted-foreground">支持招商银行账单 PDF，自动识别表头并导入。</div>
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

export default ImportCmbDialog;
