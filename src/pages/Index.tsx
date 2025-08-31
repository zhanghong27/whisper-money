import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import AuthPage from "@/components/auth/AuthPage";
import AppLayout from "@/components/layout/AppLayout";
import DashboardStats from "@/components/dashboard/DashboardStats";
import TransactionList from "@/components/transactions/TransactionList";
import AddTransactionDialog from "@/components/transactions/AddTransactionDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

interface StatsData {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
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
  const [stats, setStats] = useState<StatsData>({
    totalBalance: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
    currency: 'CNY'
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchRecentTransactions()
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

    const totalBalance = accounts?.reduce((sum, account) => sum + Number(account.balance), 0) || 0;

    // Get monthly income and expense
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    
    const { data: monthlyTransactions } = await supabase
      .from('transactions')
      .select('amount, type')
      .eq('user_id', user.id)
      .gte('date', `${currentMonth}-01`)
      .lt('date', `${currentMonth}-32`);

    const monthlyIncome = monthlyTransactions
      ?.filter(t => t.type === 'income')
      ?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    const monthlyExpense = monthlyTransactions
      ?.filter(t => t.type === 'expense')
      ?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    setStats({
      totalBalance,
      monthlyIncome,
      monthlyExpense,
      currency: accounts?.[0]?.currency || 'CNY'
    });
  };

  const fetchRecentTransactions = async () => {
    if (!user) return;

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
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

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
          <Button
            variant="outline"
            size="icon"
            onClick={fetchDashboardData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
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
      </div>
    </AppLayout>
  );
};

export default Index;
