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
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Simple expression evaluator for basic math operations
const evalExpression = (expr: string): number => {
  if (!expr) return 0;
  try {
    // Replace Chinese operators with JavaScript operators
    const jsExpr = expr.replace(/×/g, '*').replace(/÷/g, '/');
    // Use Function constructor to safely evaluate simple math expressions
    const result = new Function('return ' + jsExpr)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
};

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

interface AddTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransactionAdded: () => void;
}

const AddTransactionDialog = ({ open, onOpenChange, onTransactionAdded }: AddTransactionDialogProps) => {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [loading, setLoading] = useState(false);
  const [keepAdding, setKeepAdding] = useState(false);
  // 转账专用账户选择
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [usage, setUsage] = useState<Record<string, number>>({});
  
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [accountsResult, categoriesResult] = await Promise.all([
          supabase.from('accounts').select('*'),
          supabase.from('categories').select('*')
        ]);

        if (accountsResult.error) throw accountsResult.error;
        if (categoriesResult.error) throw categoriesResult.error;

        const accs = accountsResult.data || [];
        const cats = (categoriesResult.data || []).map(cat => ({
          ...cat,
          type: cat.type as 'income' | 'expense'
        }));
        setAccounts(accs);
        setCategories(cats);

        // 默认选中：第一个账户与“当前类型最常用”的分类（无使用记录则第一个）
        if (!selectedAccount && accs.length > 0) setSelectedAccount(accs[0].id);
        const sameType = cats.filter(c => c.type === type);
        const sortedByUsage = sameType.sort((a,b) => (usage[b.id]||0) - (usage[a.id]||0));
        const defaultCat = sortedByUsage[0] || sameType[0];
        if (!selectedCategory && defaultCat) setSelectedCategory(defaultCat.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        toast({
          title: "加载数据失败",
          description: message,
          variant: "destructive",
        });
      }
    })();
  }, [open, selectedAccount, selectedCategory, type, usage, toast]);

  // Load user and usage map
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || "";
      setUserId(uid);
      const raw = localStorage.getItem(`wm:categoryUsage:${uid}`);
      if (raw) {
        try { setUsage(JSON.parse(raw)); } catch { setUsage({}); }
      }
    })();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'transfer') {
      if (!amount || !fromAccount || !toAccount) {
        toast({ title: "请填写完整信息", description: "金额、转出账户、转入账户为必填项", variant: "destructive" });
        return;
      }
      if (fromAccount === toAccount) {
        toast({ title: "无效的转账", description: "转出账户与转入账户不能相同", variant: "destructive" });
        return;
      }
    } else if (!amount || !selectedAccount || !selectedCategory) {
      toast({
        title: "请填写完整信息",
        description: "金额、账户和分类都是必填项",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("用户未登录");

      if (type === 'transfer') {
        const amt = evalExpression(amount);
        if (!Number.isFinite(amt) || amt <= 0) throw new Error('请输入有效的转账金额');
        // 找到或创建“转账-支出 / 转账-收入”分类
        const outName = '转账-支出';
        const inName = '转账-收入';
        let outCat = categories.find(c => c.name === outName && c.type === 'expense');
        let inCat = categories.find(c => c.name === inName && c.type === 'income');
        if (!outCat) {
          const { data: oc, error: oe } = await supabase
            .from('categories')
            .insert({ user_id: userData.user.id, name: outName, type: 'expense', icon: '🔁', color: '#64748b', is_system: true })
            .select('*')
            .single();
          if (oe) throw oe; else outCat = oc as unknown as Category;
        }
        if (!inCat) {
          const { data: ic, error: ie } = await supabase
            .from('categories')
            .insert({ user_id: userData.user.id, name: inName, type: 'income', icon: '🔁', color: '#64748b', is_system: true })
            .select('*')
            .single();
          if (ie) throw ie; else inCat = ic as unknown as Category;
        }

        // 写入两条交易：转出(支出) + 转入(收入)
        const fromAcc = accounts.find(a => a.id === fromAccount);
        const toAcc = accounts.find(a => a.id === toAccount);
        const routeNote = fromAcc && toAcc ? `（${fromAcc.name} → ${toAcc.name}）` : '';
        const baseDescOut = description ? description : '转出';
        const baseDescIn = description ? description : '转入';

        const toInsert = [
          {
            user_id: userData.user.id,
            account_id: fromAccount,
            category_id: outCat!.id,
            amount: amt,
            type: 'expense',
            date: format(date, 'yyyy-MM-dd'),
            description: `${baseDescOut} ${routeNote}`.trim(),
          },
          {
            user_id: userData.user.id,
            account_id: toAccount,
            category_id: inCat!.id,
            amount: amt,
            type: 'income',
            date: format(date, 'yyyy-MM-dd'),
            description: `${baseDescIn} ${routeNote}`.trim(),
          },
        ];
        const { error: transErr } = await supabase.from('transactions').insert(toInsert);
        if (transErr) throw transErr;

        // 更新两个账户余额
        if (fromAcc) {
          const { error } = await supabase.from('accounts').update({ balance: fromAcc.balance - amt }).eq('id', fromAcc.id);
          if (error) throw error;
        }
        if (toAcc) {
          const { error } = await supabase.from('accounts').update({ balance: toAcc.balance + amt }).eq('id', toAcc.id);
          if (error) throw error;
        }
      } else {
        // 创建收入/支出交易
        const computed = evalExpression(amount);
        if (!Number.isFinite(computed) || computed <= 0) throw new Error('请输入有效的金额');
        const { error: transactionError } = await supabase.from('transactions').insert({
          user_id: userData.user.id,
          account_id: selectedAccount,
          category_id: selectedCategory,
          amount: computed,
          type,
          date: format(date, 'yyyy-MM-dd'),
          description: description || null,
        });
        if (transactionError) throw transactionError;

        // 更新账户余额
        const account = accounts.find(a => a.id === selectedAccount);
        if (account) {
          const balanceChange = type === 'income' ? computed : -computed;
          const newBalance = account.balance + balanceChange;
          const { error: balanceError } = await supabase
            .from('accounts')
            .update({ balance: newBalance })
            .eq('id', selectedAccount);
          if (balanceError) throw balanceError;
        }
      }

      toast({
        title: "交易记录已添加",
        description: `成功添加${type === 'income' ? '收入' : '支出'}记录`,
      });

      // 更新本地“常用分类”统计
      const bump = (id: string) => {
        setUsage(prev => {
          const next = { ...prev, [id]: (prev[id] || 0) + 1 };
          if (userId) localStorage.setItem(`wm:categoryUsage:${userId}`, JSON.stringify(next));
          return next;
        });
      };

      if (type === 'transfer') {
        if (outCat) bump(outCat.id);
        if (inCat) bump(inCat.id);
      } else if (selectedCategory) {
        bump(selectedCategory);
      }

      onTransactionAdded();
      if (keepAdding) {
        // 连续记账：清空金额与备注，保留账户、分类与日期
        setAmount("");
        setDescription("");
      } else {
        // 完成：重置并关闭
        setAmount("");
        setDescription("");
        setSelectedAccount("");
        setSelectedCategory("");
        setDate(new Date());
        onOpenChange(false);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "添加失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Pinyin helper: minimal mapping for common categories
  const pinyinMap: Record<string, string[]> = {
    '餐饮': ['canyin','cy'], '购物': ['gouwu','gw'], '服饰': ['fushi','fs'], '日用': ['riyong','ry'],
    '数码': ['shuma','sm'], '美妆': ['meizhuang','mz'], '护肤': ['hufu','hf'], '应用软件': ['yingyong','yy','ruanjian','rj'],
    '住房': ['zhufang','zf'], '交通': ['jiaotong','jt'], '娱乐': ['yule','yl'], '医疗': ['yiliao','yl'],
    '通讯': ['tongxun','tx'], '汽车': ['qiche','qc'], '学习': ['xuexi','xx'], '办公': ['bangong','bg'],
    '运动': ['yundong','yd'], '社交': ['shejiao','sj'], '人情': ['renqing','rq'], '育儿': ['yuer','ye'],
    '宠物': ['chongwu','cw'], '旅行': ['lvxing','lx'], '度假': ['dujia','dj'], '烟酒': ['yanjiu','yj'], '彩票': ['caipiao','cp'],
    '其他': ['qita','qt'], '工资': ['gongzi','gz'], '奖金': ['jiangjin','jj'], '兼职': ['jianzhi','jz'],
    '利息': ['lixi','lx'], '投资收益': ['touzi','tz','shouyi','sy'], '红包': ['hongbao','hb'], '退款': ['tuikuan','tk'],
    '其他收入': ['qitashouru','qtsr'], '转账-支出': ['zhuanzhang','zz'], '转账-收入': ['zhuanzhang','zz']
  };

  const matchSearch = (cat: Category) => {
    if (!search.trim()) return true;
    const key = search.trim().toLowerCase();
    const extras = pinyinMap[cat.name] || [];
    return (
      cat.name.toLowerCase().includes(key) ||
      extras.some(e => e.includes(key))
    );
  };

  const filteredCategories = categories
    .filter(c => c.type === (type === 'transfer' ? 'expense' : type))
    .filter(matchSearch)
    .sort((a,b) => (usage[b.id]||0) - (usage[a.id]||0));

  const handleKey = (k: string) => {
    setAmount(prev => {
      const isOperator = (ch: string) => ['+','-','×','÷','*','/'].includes(ch);
      if (k === 'C') return '';
      if (k === '⌫') return prev.slice(0, -1);
      if (k === '.') {
        const seg = prev.split(/[+\-×÷*/]/).pop() || '';
        if (seg.includes('.')) return prev;
        return prev ? prev + '.' : '0.';
      }
      if (isOperator(k)) {
        if (!prev) return k === '-' ? '-' : '';
        const last = prev[prev.length-1];
        return isOperator(last) ? prev.slice(0,-1) + k : prev + k;
      }
      return (prev || '') + k;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        <DialogHeader>
          <DialogTitle>添加交易记录</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs value={type} onValueChange={(value) => setType(value as 'income' | 'expense' | 'transfer')}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="expense" className="text-destructive data-[state=active]:text-destructive-foreground">
                支出
              </TabsTrigger>
              <TabsTrigger value="income" className="text-success data-[state=active]:text-success-foreground">
                收入
              </TabsTrigger>
              <TabsTrigger value="transfer" className="data-[state=active]:text-primary">
                转账
              </TabsTrigger>
            </TabsList>
            {/* 大号金额显示区 */}
            <div className="rounded-lg border bg-muted/30 p-3 mt-3">
              <div className="flex items-baseline justify-between">
                <div className="text-xs text-muted-foreground truncate">{amount || '输入数字与 + - × ÷'}</div>
                <div className={`text-2xl font-bold ${type==='expense'?'text-destructive':type==='income'?'text-success':'text-primary'}`}>
                  {(() => {
                    const s = ((): string => {
                      const toJs = (x: string) => x.replace(/×/g,'*').replace(/÷/g,'/');
                      try {
                        const v = evalExpression(amount);
                        if (!Number.isFinite(v)) return '—';
                        return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(Math.abs(v));
                      } catch { return '—'; }
                    })();
                    return s;
                  })()}
                </div>
              </div>
            </div>
          </Tabs>

          {type !== 'transfer' && (
            <div className="space-y-3">
              <Label>分类 *</Label>
              <Input
                placeholder="搜索分类（支持拼音/简拼）"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {/* Category grid */}
              <div className="grid grid-cols-4 gap-3">
                {filteredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-xs ${
                      selectedCategory === cat.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                    }`}
                  >
                    <div
                      className="mb-1 flex h-10 w-10 items-center justify-center rounded-full text-lg"
                      style={{ backgroundColor: (cat.color || '#6B7280') + '20' }}
                    >
                      {cat.icon || '📂'}
                    </div>
                    <div className="truncate max-w-[72px]">{cat.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'transfer' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>转出账户 *</Label>
                <Select value={fromAccount} onValueChange={setFromAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择转出账户" />
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
                <Label>转入账户 *</Label>
                <Select value={toAccount} onValueChange={setToAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择转入账户" />
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
            </div>
          ) : (
            <div className="space-y-2">
              <Label>账户 *</Label>
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
          )}

          <div className="space-y-2">
            <Label>日期</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "yyyy年MM月dd日", { locale: zhCN }) : "选择日期"}
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

          <div className="space-y-2">
            <Label htmlFor="description">备注</Label>
            <Textarea
              id="description"
              placeholder="添加备注信息..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2">
            {["1","2","3","+","4","5","6","-","7","8","9","×",".","0","⌫","÷"].map((k) => (
              <Button key={k} type="button" variant={/[+\-×÷]/.test(k) ? 'secondary' : 'outline'} onClick={() => handleKey(k)}>
                {k}
              </Button>
            ))}
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              取消
            </Button>
            <Button type="submit" disabled={loading} className="flex-1" onClick={() => setKeepAdding(true)}>
              {loading ? "添加中..." : "保存再记"}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1" onClick={() => setKeepAdding(false)}>
              {loading ? "添加中..." : "完成"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTransactionDialog;
