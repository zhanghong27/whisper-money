import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import AuthPage from "@/components/auth/AuthPage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, addDays, differenceInCalendarDays, startOfQuarter, endOfQuarter } from 'date-fns';
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
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  const periods = ["周", "月", "年", "全部", "范围"];

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, currentDate, selectedPeriod, customRange]);

  const getDateRange = () => {
    switch (selectedPeriod) {
      case "周":
        return { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) };
      case "月":
        return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
      case "年":
        return { start: startOfYear(currentDate), end: endOfYear(currentDate) };
      case "范围":
        if (customRange.from && customRange.to) {
          return { start: customRange.from, end: customRange.to };
        }
        return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
      case "全部":
      default:
        return { start: null as Date | null, end: null as Date | null };
    }
  };

  const fetchData = async () => {
    if (!user) return;

    // Fetch transactions for the selected period
    const { start, end } = getDateRange();

    let query = supabase
      .from('transactions')
      .select(`
        *,
        categories (name, icon, color),
        accounts (name, icon)
      `)
      .eq('user_id', user.id)
      .order('date', { ascending: true });

    if (start && end) {
      query = query.gte('date', format(start, 'yyyy-MM-dd')).lte('date', format(end, 'yyyy-MM-dd'));
    }

    const { data: transactionData } = await query;

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
    const step = direction === 'prev' ? -1 : 1;
    if (selectedPeriod === '周') {
      newDate.setDate(newDate.getDate() + step * 7);
    } else if (selectedPeriod === '范围' && customRange.from && customRange.to) {
      const len = Math.abs(differenceInCalendarDays(customRange.to, customRange.from)) + 1;
      const delta = step * len;
      const from = addDays(customRange.from, delta);
      const to = addDays(customRange.to, delta);
      setCustomRange({ from, to });
      // 保持 currentDate 位于新范围内（取新范围起始）
      newDate.setTime(from.getTime());
    } else if (selectedPeriod === '年') {
      newDate.setFullYear(newDate.getFullYear() + step);
    } else {
      // 月、范围、全部 默认按月切换
      newDate.setMonth(newDate.getMonth() + step);
    }
    setCurrentDate(newDate);
  };

  const formatDateHeader = () => {
    switch (selectedPeriod) {
      case "周": {
        const { start, end } = getDateRange();
        if (start && end) {
          const sameYear = start.getFullYear() === end.getFullYear();
          const sameMonth = sameYear && start.getMonth() === end.getMonth();
          if (sameMonth) {
            return `${format(start, 'yyyy年M月d日')}～${format(end, 'd日')}`;
          } else if (sameYear) {
            return `${format(start, 'yyyy年M月d日')}～${format(end, 'M月d日')}`;
          }
          return `${format(start, 'yyyy年M月d日')}～${format(end, 'yyyy年M月d日')}`;
        }
        return `${format(currentDate, 'yyyy年M月d日')}`;
      }
      case "范围": {
        const { start, end } = getDateRange();
        if (start && end) {
          const sameYear = start.getFullYear() === end.getFullYear();
          const sameMonth = sameYear && start.getMonth() === end.getMonth();
          if (sameMonth) {
            return `${format(start, 'yyyy年M月d日')}～${format(end, 'd日')}`;
          } else if (sameYear) {
            return `${format(start, 'yyyy年M月d日')}～${format(end, 'M月d日')}`;
          }
          return `${format(start, 'yyyy年M月d日')}～${format(end, 'yyyy年M月d日')}`;
        }
        return `${format(currentDate, 'yyyy年MM月')}`;
      }
      case "全部": {
        if (transactions && transactions.length > 0) {
          const dates = transactions
            .map((t: { date: string }) => t.date)
            .filter((s: string) => typeof s === 'string' && s.length >= 10)
            .sort(); // ISO 字符串可直接字典序排序
          if (dates.length > 0) {
            const s = dates[0];
            const e = dates[dates.length - 1];
            const sy = parseInt(s.slice(0, 4));
            const sm = parseInt(s.slice(5, 7));
            const sd = parseInt(s.slice(8, 10));
            const ey = parseInt(e.slice(0, 4));
            const em = parseInt(e.slice(5, 7));
            const ed = parseInt(e.slice(8, 10));
            if (sy === ey && sm === em) {
              return `${sy}年${sm}月${sd}日～${ed}日`;
            } else if (sy === ey) {
              return `${sy}年${sm}月${sd}日～${em}月${ed}日`;
            }
            return `${sy}年${sm}月${sd}日～${ey}年${em}月${ed}日`;
          }
        }
        return "全部";
      }
      case "月":
        return `${format(currentDate, 'yyyy年MM月')}`;
      case "年":
        return `${format(currentDate, 'yyyy年')}`;
      default:
        return `${format(currentDate, 'yyyy年MM月')}`;
    }
  };

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">统计</h1>
        </div>
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

        {/* Range Picker for "范围" */}
        {selectedPeriod === "范围" && (
          <div className="flex items-center gap-3">
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
                    onSelect={(range) => {
                      setCustomRange(range ?? {});
                      if (range?.from && range?.to) {
                        setCurrentDate(range.from);
                      }
                    }}
                    numberOfMonths={2}
                    initialFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => {
                      const to = new Date();
                      const from = addDays(to, -6);
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>最近7天</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const to = new Date();
                      const from = addDays(to, -29);
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>最近30天</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const to = new Date();
                      const from = addDays(to, -89);
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>最近90天</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const to = new Date();
                      const from = addDays(to, -179);
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>最近半年</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const to = new Date();
                      const from = addDays(to, -364);
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>最近一年</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const today = new Date();
                      const from = startOfWeek(today, { weekStartsOn: 1 });
                      const to = endOfWeek(today, { weekStartsOn: 1 });
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>本周</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const today = new Date();
                      const from = startOfMonth(today);
                      const to = endOfMonth(today);
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>本月</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const today = new Date();
                      const from = startOfQuarter(today);
                      const to = endOfQuarter(today);
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>本季度</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const today = new Date();
                      const from = startOfYear(today);
                      const to = endOfYear(today);
                      setCustomRange({ from, to });
                      setCurrentDate(from);
                    }}>本年</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {customRange.from && customRange.to && (
              <Button variant="ghost" size="sm" onClick={() => setCustomRange({})}>
                清除
              </Button>
            )}
          </div>
        )}

        {/* Stats Overview (Screenshot 5) */}
        <StatsOverview 
          transactions={transactions}
          accounts={accounts}
        />

        {/* Expense Chart (Screenshot 1) */}
        <ExpenseChart 
          transactions={transactions}
          currentDate={currentDate}
          startDate={getDateRange().start}
          endDate={getDateRange().end}
          selectedPeriod={selectedPeriod}
        />

        {/* Asset Trend Chart (Screenshot 2) */}
        <AssetTrendChart 
          transactions={transactions}
          accounts={accounts}
          currentDate={currentDate}
          startDate={getDateRange().start}
          endDate={getDateRange().end}
          selectedPeriod={selectedPeriod}
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
    </AppLayout>
  );
};

export default Statistics;
