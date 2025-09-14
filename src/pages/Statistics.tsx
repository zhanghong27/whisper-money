import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import StatsOverview from "@/components/statistics/StatsOverview";
import ExpenseChart from "@/components/statistics/ExpenseChart";
import AssetTrendChart from "@/components/statistics/AssetTrendChart";
import CategoryBreakdown from "@/components/statistics/CategoryBreakdown";
import MonthlySummary from "@/components/statistics/MonthlySummary";

const Statistics = () => {
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState("月");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);

  const periods = ["周", "月", "年", "全部", "范围"];

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, currentDate, selectedPeriod]);

  const fetchData = async () => {
    if (!user) return;

    // Fetch transactions for the selected period
    const startDate = startOfMonth(currentDate);
    const endDate = endOfMonth(currentDate);

    const { data: transactionData } = await supabase
      .from('transactions')
      .select(`
        *,
        categories (name, icon, color),
        accounts (name, icon)
      `)
      .eq('user_id', user.id)
      .gte('date', format(startDate, 'yyyy-MM-dd'))
      .lte('date', format(endDate, 'yyyy-MM-dd'))
      .order('date', { ascending: true });

    const { data: accountData } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false);

    const { data: categoryData } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false);

    setTransactions(transactionData || []);
    setAccounts(accountData || []);
    setCategories(categoryData || []);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const formatDateHeader = () => {
    switch (selectedPeriod) {
      case "周":
        return `${format(currentDate, 'yyyy年MM月第w周')}`;
      case "月":
        return `${format(currentDate, 'yyyy年MM月')}`;
      case "年":
        return `${format(currentDate, 'yyyy年')}`;
      default:
        return `${format(currentDate, 'yyyy年MM月')}`;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <h1 className="text-2xl font-bold">统计</h1>
          <Button variant="ghost" size="icon">
            <User className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Period Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {periods.map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedPeriod(period)}
              className="whitespace-nowrap"
            >
              {period}
            </Button>
          ))}
        </div>

        {/* Date Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth('prev')}
            className="rounded-full bg-primary text-primary-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <h2 className="text-lg font-medium">{formatDateHeader()}</h2>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth('next')}
            className="rounded-full bg-primary text-primary-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats Overview (Screenshot 5) */}
        <StatsOverview 
          transactions={transactions}
          accounts={accounts}
        />

        {/* Expense Chart (Screenshot 1) */}
        <ExpenseChart 
          transactions={transactions}
          currentDate={currentDate}
        />

        {/* Asset Trend Chart (Screenshot 2) */}
        <AssetTrendChart 
          transactions={transactions}
          accounts={accounts}
          currentDate={currentDate}
        />

        {/* Category Breakdown (Screenshot 3) */}
        <CategoryBreakdown 
          transactions={transactions}
          categories={categories}
        />

        {/* Monthly Summary (Screenshot 4) */}
        <MonthlySummary 
          transactions={transactions}
          currentDate={currentDate}
        />
      </div>
    </div>
  );
};

export default Statistics;