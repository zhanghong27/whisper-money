import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import AuthPage from "@/components/auth/AuthPage";
import AppLayout from "@/components/layout/AppLayout";
import DashboardStats from "@/components/dashboard/DashboardStats";
import TransactionList from "@/components/transactions/TransactionList";
import AddTransactionDialog from "@/components/transactions/AddTransactionDialog";
import ImportAlipayDialog from "@/components/transactions/ImportAlipayDialog";
import ImportWechatDialog from "@/components/transactions/ImportWechatDialog";
import ImportCmbDialog from "@/components/transactions/ImportCmbDialog";
import ImportBocDialog from "@/components/transactions/ImportBocDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
// removed month Input; using unified period navigation
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Loader2, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, addDays, differenceInCalendarDays } from 'date-fns';

interface StatsData {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  totalSavings: number;
  currency: string;
}

interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description: string;
  date: string;
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

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showImportAlipay, setShowImportAlipay] = useState(false);
  const [showImportWechat, setShowImportWechat] = useState(false);
  const [showImportCmb, setShowImportCmb] = useState(false);
  const [showImportBoc, setShowImportBoc] = useState(false);
  const [stats, setStats] = useState<StatsData>({
    totalBalance: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
    totalSavings: 0,
    currency: 'CNY'
  });
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<'周' | '月' | '年' | '全部' | '范围'>('月');
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const periods: Array<'周' | '月' | '年' | '全部' | '范围'> = ['周','月','年','全部','范围'];

  const getDateRange = () => {
    const base = selectedMonth ?? new Date();
    switch (selectedPeriod) {
      case '周':
        return { start: startOfWeek(base, { weekStartsOn: 1 }), end: endOfWeek(base, { weekStartsOn: 1 }) };
      case '月':
        return { start: startOfMonth(base), end: endOfMonth(base) };
      case '年':
        return { start: startOfYear(base), end: endOfYear(base) };
      case '范围':
        if (customRange.from && customRange.to) return { start: customRange.from, end: customRange.to };
        return { start: startOfMonth(base), end: endOfMonth(base) };
      case '全部':
      default:
        return { start: null as Date | null, end: null as Date | null };
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  // Recompute stats and transactions when month/period changes
  useEffect(() => {
    if (user) {
      fetchStats();
      fetchMonthTransactions();
    }
  }, [user, selectedMonth, selectedPeriod, customRange]);

  const fetchDashboardData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchMonthTransactions()
      ]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!user) return;

    const { start, end } = getDateRange();
    
    // Single optimized query to get all needed data
    let allTransactionsQuery = supabase
      .from('transactions')
      .select('amount, type, date')
      .eq('user_id', user.id);
    
    if (end) {
      allTransactionsQuery = allTransactionsQuery.lte('date', format(end, 'yyyy-MM-dd'));
    }
    
    const [{ data: allTransactions }, { data: accounts }] = await Promise.all([
      allTransactionsQuery,
      supabase
        .from('accounts')
        .select('currency')
        .eq('user_id', user.id)
        .limit(1)
    ]);

    if (!allTransactions) return;

    // Calculate all stats in one pass
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    let cumulativeIncome = 0;
    let cumulativeExpense = 0;

    const startStr = start ? format(start, 'yyyy-MM-dd') : null;
    const endStr = end ? format(end, 'yyyy-MM-dd') : null;

    for (const transaction of allTransactions) {
      const amount = Number(transaction.amount);
      const isInPeriod = (!startStr || transaction.date >= startStr) && 
                        (!endStr || transaction.date <= endStr);
      
      if (transaction.type === 'income') {
        cumulativeIncome += amount;
        if (isInPeriod) monthlyIncome += amount;
      } else if (transaction.type === 'expense') {
        cumulativeExpense += Math.abs(amount);
        if (isInPeriod) monthlyExpense += Math.abs(amount);
      }
    }

    const totalSavings = cumulativeIncome - cumulativeExpense;
    const totalBalance = monthlyIncome - monthlyExpense;
    
    setStats({
      totalBalance,
      monthlyIncome,
      monthlyExpense,
      totalSavings,
      currency: accounts?.[0]?.currency || 'CNY'
    });
  };

  const fetchMonthTransactions = async () => {
    if (!user) return;

    const { start, end } = getDateRange();

    let listQuery = supabase
      .from('transactions')
      .select(`
        id,
        amount,
        type,
        description,
        date,
        source,
        category_id,
        account_id,
        categories (name, icon, color),
        accounts (name, icon)
      `)
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(100);

    if (start && end) {
      listQuery = listQuery.gte('date', format(start, 'yyyy-MM-dd')).lte('date', format(end, 'yyyy-MM-dd'));
    }

    const { data: transactionData } = await listQuery;
    
    const formattedTransactions = (transactionData || []).map(t => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type as 'income' | 'expense' | 'transfer',
      description: t.description || '',
      date: t.date,
      source: t.source,
      category_id: t.category_id,
      account_id: t.account_id,
      category: {
        name: t.categories?.name || '',
        icon: t.categories?.icon || '📂',
        color: t.categories?.color || '#6B7280'
      },
      account: {
        name: t.accounts?.name || '',
        icon: t.accounts?.icon || '💰'
      }
    }));

    setTransactions(formattedTransactions);
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const step = direction === 'prev' ? -1 : 1;
    const d = new Date(selectedMonth);
    if (selectedPeriod === '周') {
      d.setDate(d.getDate() + step * 7);
      setSelectedMonth(d);
    } else if (selectedPeriod === '年') {
      d.setFullYear(d.getFullYear() + step);
      setSelectedMonth(d);
    } else if (selectedPeriod === '范围' && customRange.from && customRange.to) {
      const len = Math.abs(differenceInCalendarDays(customRange.to, customRange.from)) + 1;
      const from = addDays(customRange.from, step * len);
      const to = addDays(customRange.to, step * len);
      setCustomRange({ from, to });
      setSelectedMonth(from);
    } else {
      d.setMonth(d.getMonth() + step);
      setSelectedMonth(d);
    }
  };

  const formatDateHeader = () => {
    const { start, end } = getDateRange();
    if (selectedPeriod === '周' || selectedPeriod === '范围') {
      if (start && end) {
        const sameYear = start.getFullYear() === end.getFullYear();
        const sameMonth = sameYear && start.getMonth() === end.getMonth();
        if (sameMonth) return `${format(start, 'yyyy年M月d日')}～${format(end, 'd日')}`;
        if (sameYear) return `${format(start, 'yyyy年M月d日')}～${format(end, 'M月d日')}`;
        return `${format(start, 'yyyy年M月d日')}～${format(end, 'yyyy年M月d日')}`;
      }
    } else if (selectedPeriod === '月') {
      return format(selectedMonth, 'yyyy年MM月');
    } else if (selectedPeriod === '年') {
      return format(selectedMonth, 'yyyy年');
    } else if (selectedPeriod === '全部') {
      return '全部';
    }
    return format(selectedMonth, 'yyyy年MM月');
  };

  const handleTransactionAdded = () => {
    fetchDashboardData();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppLayout 
      user={user} 
      onAddTransaction={() => setShowAddTransaction(true)}
    >
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="space-y-6 pb-20 md:pb-6 px-4 md:px-6 pt-4">
        {/* Header with refresh - 移动端优化 */}
        <div className="flex items-center justify-between">
          <div className="animate-fade-in">
            <h1 className="text-xl md:text-2xl font-bold flex items-baseline gap-2">
              <span>财务概览</span>
              <span className="text-xs text-muted-foreground">{formatDateHeader()}</span>
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">管理您的收入和支出</p>
          </div>
          {/* 右侧 导入 + 刷新 */}
          <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-1 md:flex-none">
                    <span className="md:hidden">导入</span>
                    <span className="hidden md:inline">导入数据</span>
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48 z-50 bg-background border shadow-lg">
                  <DropdownMenuItem onClick={() => setShowImportAlipay(true)}>
                    <span className="mr-2">💰</span>
                    导入支付宝
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowImportWechat(true)}>
                    <span className="mr-2">💚</span>
                    导入微信
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowImportCmb(true)}>
                    <span className="mr-2">🏦</span>
                    导入招行
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowImportBoc(true)}>
                    <span className="mr-2">🏛️</span>
                    导入中行
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button
                variant="outline"
                size="icon"
                onClick={fetchDashboardData}
                disabled={loading}
                className="hover-scale"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
          </div>
        </div>

        {/* Period selector + navigation (sticky) */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {periods.map((p) => (
              <Button
                key={p}
                variant={selectedPeriod === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPeriod(p)}
                className="whitespace-nowrap"
              >
                {p}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigatePeriod('prev')}
              className="rounded-full bg-primary text-primary-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-medium">{formatDateHeader()}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigatePeriod('next')}
              className="rounded-full bg-primary text-primary-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {selectedPeriod === '范围' && (
            <div className="flex items-center gap-3 mt-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customRange.from && customRange.to
                      ? `${format(customRange.from, 'yyyy年MM月dd日')} - ${format(customRange.to, 'yyyy年MM月dd日')}`
                      : '选择日期范围'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <div className="flex flex-col gap-3">
                    <Calendar
                      mode="range"
                      selected={customRange.from && customRange.to ? { from: customRange.from, to: customRange.to } : undefined}
                      onSelect={(range) => { setCustomRange(range ?? {}); if (range?.from) setSelectedMonth(range.from); }}
                      numberOfMonths={2}
                      initialFocus
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => { const to = new Date(); const from = addDays(to,-6); setCustomRange({from,to}); setSelectedMonth(from); }}>最近7天</Button>
                      <Button size="sm" variant="secondary" onClick={() => { const to = new Date(); const from = addDays(to,-29); setCustomRange({from,to}); setSelectedMonth(from); }}>最近30天</Button>
                      <Button size="sm" variant="secondary" onClick={() => { const to = new Date(); const from = addDays(to,-89); setCustomRange({from,to}); setSelectedMonth(from); }}>最近90天</Button>
                      <Button size="sm" variant="secondary" onClick={() => { const to = new Date(); const from = addDays(to,-179); setCustomRange({from,to}); setSelectedMonth(from); }}>最近半年</Button>
                      <Button size="sm" variant="secondary" onClick={() => { const to = new Date(); const from = addDays(to,-364); setCustomRange({from,to}); setSelectedMonth(from); }}>最近一年</Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {customRange.from && customRange.to && (
                <Button variant="ghost" size="sm" onClick={() => setCustomRange({})}>清除</Button>
              )}
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <DashboardStats stats={stats} />

        {/* Recent Transactions */}
        <div className="space-y-4">
          <TransactionList 
            transactions={transactions}
            onTransactionUpdated={fetchDashboardData}
          />
        </div>

        {/* Add Transaction Dialog */}
        <AddTransactionDialog
          open={showAddTransaction}
          onOpenChange={setShowAddTransaction}
          onTransactionAdded={handleTransactionAdded}
        />

        {/* Import Alipay Dialog */}
        <ImportAlipayDialog
          open={showImportAlipay}
          onOpenChange={setShowImportAlipay}
          onImported={fetchDashboardData}
        />
        <ImportWechatDialog
          open={showImportWechat}
          onOpenChange={setShowImportWechat}
          onImported={fetchDashboardData}
        />
        <ImportCmbDialog
          open={showImportCmb}
          onOpenChange={setShowImportCmb}
          onImported={fetchDashboardData}
        />
        <ImportBocDialog
          open={showImportBoc}
          onOpenChange={setShowImportBoc}
          onImported={fetchDashboardData}
        />
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
