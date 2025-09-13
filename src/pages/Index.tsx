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
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Loader2, RefreshCw, ChevronDown } from "lucide-react";
import { format } from 'date-fns';

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  // Recompute stats and transactions when month changes
  useEffect(() => {
    if (user) {
      fetchStats();
      fetchMonthTransactions();
    }
  }, [user, selectedMonth]);

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

    // Get total balance from all accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('balance, currency')
      .eq('user_id', user.id)
      .eq('is_deleted', false);

    // Calculate total savings (sum of all account balances)
    const totalSavings = accounts?.reduce((sum, account) => sum + Number(account.balance), 0) || 0;

    // Get monthly income and expense
    // Calculate [startOfMonth, startOfNextMonth)
    const base = selectedMonth ?? new Date();
    const startOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
    const startOfNextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);

    const { data: monthlyTransactions } = await supabase
      .from('transactions')
      .select('amount, type')
      .eq('user_id', user.id)
      .gte('date', format(startOfMonth, 'yyyy-MM-dd'))
      .lt('date', format(startOfNextMonth, 'yyyy-MM-dd'));

    const monthlyIncome = monthlyTransactions
      ?.filter(t => t.type === 'income')
      ?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    const monthlyExpense = monthlyTransactions
      ?.filter(t => t.type === 'expense')
      ?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    // Per request: 总余额 = 本月收入 - 本月支出
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

    const base = selectedMonth ?? new Date();
    const startOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
    const startOfNextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);

    const { data } = await supabase
      .from('transactions')
      .select(`
        id,
        amount,
        type,
        description,
        date,
        categories (name, icon, color),
        accounts (name, icon)
      `)
      .eq('user_id', user.id)
      .gte('date', format(startOfMonth, 'yyyy-MM-dd'))
      .lt('date', format(startOfNextMonth, 'yyyy-MM-dd'))
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    const formattedTransactions = data?.map(t => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type as 'income' | 'expense' | 'transfer',
      description: t.description || '',
      date: t.date,
      category: {
        name: t.categories?.name || '',
        icon: t.categories?.icon || '📂',
        color: t.categories?.color || '#6B7280'
      },
      account: {
        name: t.accounts?.name || '',
        icon: t.accounts?.icon || '💰'
      }
    })) || [];

    setTransactions(formattedTransactions);
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
      <div className="space-y-6 pb-20 md:pb-6">
        {/* Header with refresh */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">财务概览</h1>
            <p className="text-muted-foreground">管理您的收入和支出</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={format(selectedMonth, 'yyyy-MM')}
              onChange={(e) => {
                const val = e.target.value; // yyyy-MM
                if (val) {
                  const d = new Date(val + '-01');
                  if (!isNaN(d.getTime())) setSelectedMonth(d);
                }
              }}
              className="w-[150px]"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  导入数据
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
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
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <DashboardStats stats={stats} />

        {/* Recent Transactions */}
        <div className="space-y-4">
          <TransactionList 
            transactions={transactions}
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
    </AppLayout>
  );
};

export default Index;
