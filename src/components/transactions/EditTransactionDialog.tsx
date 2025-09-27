import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Account {
  id: string;
  name: string;
  icon: string;
  balance: number;
}

interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  color: string;
}

interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description: string;
  date: string;
  category_id?: string;
  account_id?: string;
  category: {
    name: string;
    icon: string;
    color: string;
  };
  account: {
    name: string;
    icon: string;
  };
}

interface EditTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onTransactionUpdated: () => void;
}

const EditTransactionDialog = ({ open, onOpenChange, transaction, onTransactionUpdated }: EditTransactionDialogProps) => {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchAccountsAndCategories();
      if (transaction) {
        // 预填充表单数据
        setAmount(Math.abs(transaction.amount).toString());
        setDescription(transaction.description);
        setType(transaction.type);
        setDate(parseISO(transaction.date));
        // 设置当前的分类和账户ID
        setSelectedCategory(transaction.category_id || "");
        setSelectedAccount(transaction.account_id || "");
      }
    }
  }, [open, transaction]);

  const fetchAccountsAndCategories = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [accountsResult, categoriesResult] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id)
    ]);

    if (accountsResult.data) {
      setAccounts(accountsResult.data);
    }
    if (categoriesResult.data) setCategories(categoriesResult.data.map(cat => ({
      ...cat,
      type: cat.type as 'income' | 'expense'
    })));
  };

  const handleUpdate = async () => {
    if (!transaction || !amount || !selectedAccount || !selectedCategory) {
      toast({
        title: "请填写所有必填字段",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("用户未登录");

      const amountValue = type === 'expense' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));

      const { error } = await supabase
        .from('transactions')
        .update({
          amount: amountValue,
          type,
          description: description || null,
          date: format(date, 'yyyy-MM-dd'),
          account_id: selectedAccount,
          category_id: selectedCategory,
        })
        .eq('id', transaction.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "交易记录已更新",
        description: "交易信息已成功修改",
      });

      onTransactionUpdated();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Error updating transaction:', error);
      toast({
        title: "更新失败",
        description: "无法更新交易记录，请重试",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!transaction) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("用户未登录");
      // 软删除：标记 is_deleted=true，并保留 id 以便撤回
      const { data: backupRow, error: fetchErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transaction.id)
        .eq('user_id', user.id)
        .single();
      if (fetchErr) throw fetchErr;
      const { error: updErr } = await supabase
        .from('transactions')
        .update({ is_deleted: true })
        .eq('id', transaction.id)
        .eq('user_id', user.id);
      if (updErr) throw updErr;

      // 回滚账户余额
      try {
        const amt = Math.abs(Number(backupRow.amount || 0));
        let deltaBal = 0;
        if (backupRow.type === 'income') deltaBal = -amt;
        else if (backupRow.type === 'expense') deltaBal = +amt;
        if (deltaBal !== 0) {
          const { data: accData, error: accErr } = await supabase
            .from('accounts')
            .select('id, balance')
            .eq('id', backupRow.account_id)
            .single();
          if (!accErr && accData) {
            const newBalance = Number(accData.balance || 0) + deltaBal;
            const { error: balErr } = await supabase
              .from('accounts')
              .update({ balance: newBalance })
              .eq('id', backupRow.account_id);
            if (balErr) console.error('Balance rollback failed:', balErr);
          }
        }
      } catch (e) {
        console.error('Rollback balance error:', e);
      }

      // 展示可撤回的提示（5 秒内）
      let undoValid = true;
      setTimeout(() => { undoValid = false; }, 5000);
      toast({
        title: "交易记录已删除",
        description: "5 秒内可撤回",
        duration: 5000,
        action: (
          <ToastAction altText="撤回" asChild>
            <button onClick={async () => {
              try {
                if (!undoValid) return;
                if (!backupRow) return;
                // 撤回：将 is_deleted=false
                const { error: undoErr } = await supabase
                  .from('transactions')
                  .update({ is_deleted: false })
                  .eq('id', backupRow.id)
                  .eq('user_id', user.id);
                if (undoErr) throw undoErr;

                // 撤回时恢复账户余额
                try {
                  const amt = Math.abs(Number(backupRow.amount || 0));
                  let deltaBal = 0;
                  if (backupRow.type === 'income') deltaBal = +amt;
                  else if (backupRow.type === 'expense') deltaBal = -amt;
                  if (deltaBal !== 0) {
                    const { data: accData, error: accErr } = await supabase
                      .from('accounts')
                      .select('id, balance')
                      .eq('id', backupRow.account_id)
                      .single();
                    if (!accErr && accData) {
                      const newBalance = Number(accData.balance || 0) + deltaBal;
                      const { error: balErr } = await supabase
                        .from('accounts')
                        .update({ balance: newBalance })
                        .eq('id', backupRow.account_id);
                      if (balErr) console.error('Balance restore failed:', balErr);
                    }
                  }
                } catch (e) {
                  console.error('Restore balance error:', e);
                }
                onTransactionUpdated();
                // 撤回成功：1s 自动消失
                toast({ title: '已撤回删除的交易', duration: 1000 });
              } catch (e) {
                console.error('Undo failed:', e);
                toast({ title: '撤回失败', description: (e as any)?.message || String(e), variant: 'destructive', duration: 2000 });
              }
            }}>撤回</button>
          </ToastAction>
        ),
      });

      onTransactionUpdated();
      onOpenChange(false);
      setShowDeleteDialog(false);
      resetForm();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      toast({
        title: "删除失败",
        description: "无法删除交易记录，请重试",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setSelectedAccount("");
    setSelectedCategory("");
    setDate(new Date());
    setType('expense');
  };

  const filteredCategories = categories.filter(cat => cat.type === type);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>编辑交易记录</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* 交易类型选择 */}
            <Tabs value={type} onValueChange={(value) => setType(value as 'income' | 'expense' | 'transfer')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="expense">支出</TabsTrigger>
                <TabsTrigger value="income">收入</TabsTrigger>
                <TabsTrigger value="transfer">转账</TabsTrigger>
              </TabsList>

              <TabsContent value="expense" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">金额 *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">日期 *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "yyyy-MM-dd", { locale: zhCN }) : "选择日期"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(date) => date && setDate(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">分类 *</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <div className="flex items-center gap-2">
                            <span>{category.icon}</span>
                            <span>{category.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account">账户 *</Label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择账户" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex items-center gap-2">
                            <span>{account.icon}</span>
                            <span>{account.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">备注</Label>
                  <Textarea
                    id="description"
                    placeholder="添加备注..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="income" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">金额 *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">日期 *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "yyyy-MM-dd", { locale: zhCN }) : "选择日期"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(date) => date && setDate(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">分类 *</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <div className="flex items-center gap-2">
                            <span>{category.icon}</span>
                            <span>{category.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account">账户 *</Label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择账户" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex items-center gap-2">
                            <span>{account.icon}</span>
                            <span>{account.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">备注</Label>
                  <Textarea
                    id="description"
                    placeholder="添加备注..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="transfer" className="space-y-4">
                <div className="text-center text-muted-foreground py-8">
                  转账功能暂不支持编辑
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button onClick={handleUpdate} disabled={loading || type === 'transfer'}>
                {loading ? "更新中..." : "更新"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除这条交易记录吗？删除后可在短时间内撤回。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
              disabled={loading}
            >
              {loading ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default EditTransactionDialog;
