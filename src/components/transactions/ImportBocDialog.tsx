import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseBocPdf, bocAmountToNumber, BocParseResult } from "@/lib/boc";
import { supabase } from "@/integrations/supabase/client";
import { ToastAction } from "@/components/ui/toast";

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
        const catRes = await resolveCategoryId(userId, catName, type);
        const categoryId = catRes.id;
        if (catRes.created) createdCategoryIds.push(categoryId);
        const dateStr = rec.日期;
        const descParts = [rec.摘要, rec.对方信息].filter(Boolean);
        const description = descParts.join(' - ');
        // New fingerprint: 记账日期(YYYYMMDD) + 带符号金额(两位小数) + 余额(两位小数)
        const ymd = toYmd(dateStr);
        const balanceRaw = (rec.余额 ?? '').toString();
        const hasBalance = balanceRaw.trim().length > 0;
        const balanceNum = hasBalance ? bocAmountToNumber(balanceRaw) : 0;
        const fingerprint = hasBalance
          ? `${ymd}${moneyToFixed2(type === 'income' ? amt : -amt)}${moneyToFixed2(balanceNum)}`
          : `${dateStr}|${Math.round(Math.abs(amt)*100)}|${description}`; // fallback to legacy style when no balance available
        if (uniqSet.has(fingerprint)) continue;
        uniqSet.add(fingerprint);

        toInsert.push({
          user_id: userId,
          account_id: accountId,
          category_id: categoryId,
          amount: type === 'income' ? amt : -amt,
          type,
          date: dateStr + ' 00:00:00',
          occurred_at: dateStr + ' 00:00:00',
          description,
          source: 'boc',
          unique_hash: fingerprint,
        });
      }
      if (toInsert.length === 0) {
        toast({ title: '没有可导入的记录' });
        return;
      }
      // Check existing: new + legacy fingerprints (for old runs or missing balance) + field-combo fallback
      const newFps = toInsert.map(r => r.unique_hash);
      const legacyFps = result.records.map(rec => {
        let _amt = 0; let _type: 'income' | 'expense' = 'expense';
        const d = bocAmountToNumber(rec.贷方金额);
        const c = bocAmountToNumber(rec.借方金额);
        if (d > 0) { _amt = d; _type = 'income'; }
        else if (c > 0) { _amt = c; _type = 'expense'; }
        else { const v = bocAmountToNumber(rec.金额); _amt = Math.abs(v); _type = v >= 0 ? 'income' : 'expense'; }
        const ds = rec.日期;
        const des = [rec.摘要, rec.对方信息].filter(Boolean).join(' - ');
        return `${ds}|${Math.round(Math.abs(_amt)*100)}|${des}`;
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
