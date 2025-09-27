import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TransactionList from "@/components/transactions/TransactionList";
import { supabase } from "@/integrations/supabase/client";
import { addDays, subMonths, subWeeks, subYears, differenceInCalendarDays, format } from "date-fns";

interface CategoryBreakdownProps {
  transactions: any[];
  categories: any[];
  startDate?: Date | null;
  endDate?: Date | null;
  selectedPeriod?: string;
}

interface CategoryData {
  name: string;
  amount: number;
  count: number;
  icon: string;
  color: string;
}

const CategoryBreakdown = ({ transactions, categories, startDate, endDate, selectedPeriod }: CategoryBreakdownProps) => {
  const [selectedType, setSelectedType] = useState("支出");
  const types = ["支出", "收入"];
  const [displayMode, setDisplayMode] = useState<'amount' | 'percent'>("amount");
  const [compareMode, setCompareMode] = useState<'mom' | 'yoy'>("mom");

  // 环比/同比基期数据（按照分类聚合，以名称为键）
  const [baseSumsMoM, setBaseSumsMoM] = useState<Record<string, number>>({});
  const [baseSumsYoY, setBaseSumsYoY] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        // 仅当时间范围存在时才计算基期
        if (!startDate || !endDate) {
          setBaseSumsMoM({}); setBaseSumsYoY({});
          return;
        }
        const st = startDate; const ed = endDate;
        const days = Math.max(1, differenceInCalendarDays(ed, st) + 1);
        const isWeek = selectedPeriod === '周';
        const isMonth = selectedPeriod === '月';
        const isYear = selectedPeriod === '年';

        // 环比区间
        let prevStart: Date; let prevEnd: Date;
        if (isWeek) { prevStart = subWeeks(st, 1); prevEnd = subWeeks(ed, 1); }
        else if (isMonth) { prevStart = subMonths(st, 1); prevEnd = subMonths(ed, 1); }
        else if (isYear) { prevStart = subYears(st, 1); prevEnd = subYears(ed, 1); }
        else { prevStart = addDays(st, -days); prevEnd = addDays(ed, -days); }

        // 同比区间（去年同期）
        const yoyStart = subYears(st, 1);
        const yoyEnd = subYears(ed, 1);

        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id;
        if (!userId) { setBaseSumsMoM({}); setBaseSumsYoY({}); return; }

        const typeFilter = selectedType === '收入' ? 'income' : 'expense';
        const select = `amount,type,categories(name,icon,color)`;
        const toStr = (d: Date) => format(d, 'yyyy-MM-dd');

        const [prevRes, yoyRes] = await Promise.all([
          supabase.from('transactions')
            .select(select)
            .eq('user_id', userId)
            .gte('date', toStr(prevStart))
            .lte('date', toStr(prevEnd))
            .eq('type', typeFilter)
            .eq('is_deleted', false),
          supabase.from('transactions')
            .select(select)
            .eq('user_id', userId)
            .gte('date', toStr(yoyStart))
            .lte('date', toStr(yoyEnd))
            .eq('type', typeFilter)
            .eq('is_deleted', false)
        ]);

        const agg = (rows: any[] | null | undefined) => {
          const map: Record<string, number> = {};
          (rows || []).forEach(r => {
            const name = r.categories?.name || '其他';
            const val = Math.abs(Number(r.amount) || 0);
            map[name] = (map[name] || 0) + val;
          });
          return map;
        };
        setBaseSumsMoM(agg(prevRes.data));
        setBaseSumsYoY(agg(yoyRes.data));
      } catch {
        setBaseSumsMoM({}); setBaseSumsYoY({});
      }
    })();
  }, [startDate, endDate, selectedType, selectedPeriod]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
  };

  // Filter transactions by type
  const filteredTransactions = transactions.filter(t => 
    selectedType === "支出" ? t.type === 'expense' : t.type === 'income'
  );

  // Group by category
  const categoryStats: Record<string, CategoryData> = {};
  
  filteredTransactions.forEach(transaction => {
    const categoryName = transaction.categories?.name || '其他';
    const categoryIcon = transaction.categories?.icon || '📂';
    const categoryColor = transaction.categories?.color || '#6B7280';
    
    if (!categoryStats[categoryName]) {
      categoryStats[categoryName] = {
        name: categoryName,
        amount: 0,
        count: 0,
        icon: categoryIcon,
        color: categoryColor
      };
    }
    
    // 对于支出类型，使用绝对值进行统计
    const amountValue = Math.abs(Number(transaction.amount));
    categoryStats[categoryName].amount += amountValue;
    categoryStats[categoryName].count += 1;
  });

  const categoryData = Object.values(categoryStats).sort((a, b) => b.amount - a.amount);
  const totalAmount = categoryData.reduce((sum, cat) => sum + cat.amount, 0);

  // Prepare data for pie chart
  const pieData = categoryData.map((cat) => ({
    name: cat.name,
    value: cat.amount,
    percentage: totalAmount > 0 ? (cat.amount / totalAmount * 100) : 0,
    color: cat.color
  }));

  // Colors for pie chart
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

  // Drilldown dialog state
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<{ name: string; color: string; icon: string } | null>(null);

  const openCategory = (cat: CategoryData, color: string) => {
    setActiveCategory({ name: cat.name, color, icon: cat.icon });
    setOpen(true);
  };

  // Prepare transactions for the selected category in dialog
  const dialogTransactions = useMemo(() => {
    if (!open || !activeCategory) return [] as any[];
    const list = transactions
      .filter(t => (selectedType === '支出' ? t.type === 'expense' : t.type === 'income'))
      .filter(t => (t.categories?.name || '其他') === activeCategory.name)
      .map(t => ({
        id: t.id,
        amount: Number(t.amount),
        type: t.type,
        description: t.description || '',
        date: t.date,
        category: {
          name: t.categories?.name || activeCategory.name,
          icon: t.categories?.icon || activeCategory.icon,
          color: t.categories?.color || activeCategory.color,
        },
        account: {
          name: t.accounts?.name || '',
          icon: t.accounts?.icon || '💰',
        },
      }));
    return list;
  }, [open, activeCategory, transactions, selectedType]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span className="text-lg">📊</span>
          支出分类
        </CardTitle>
        <div className="flex items-center gap-2">
          {/* 金额/占比 Toggle */}
          <div className="bg-muted rounded-lg p-0.5 flex">
            <Button 
              size="sm" 
              variant="ghost"
              className={`rounded-md px-2 py-1 h-7 text-xs transition-all ${
                displayMode === 'amount' 
                  ? 'bg-primary text-primary-foreground shadow-sm' 
                  : 'hover:bg-muted-foreground/10'
              }`}
              onClick={() => setDisplayMode('amount')}
            >
              金额
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              className={`rounded-md px-2 py-1 h-7 text-xs transition-all ${
                displayMode === 'percent' 
                  ? 'bg-primary text-primary-foreground shadow-sm' 
                  : 'hover:bg-muted-foreground/10'
              }`}
              onClick={() => setDisplayMode('percent')}
            >
              占比
            </Button>
          </div>
          
          {/* 环比/同比 Toggle */}
          <div className="bg-muted rounded-lg p-0.5 flex">
            <Button 
              size="sm" 
              variant="ghost"
              className={`rounded-md px-2 py-1 h-7 text-xs transition-all ${
                compareMode === 'mom' 
                  ? 'bg-accent text-accent-foreground shadow-sm' 
                  : 'hover:bg-muted-foreground/10'
              }`}
              onClick={() => setCompareMode('mom')}
            >
              环比
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              className={`rounded-md px-2 py-1 h-7 text-xs transition-all ${
                compareMode === 'yoy' 
                  ? 'bg-accent text-accent-foreground shadow-sm' 
                  : 'hover:bg-muted-foreground/10'
              }`}
              onClick={() => setCompareMode('yoy')}
            >
              同比
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {totalAmount > 0 ? (
          <>
            {/* Pie Chart */}
            <div className="relative h-48 w-full mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xs text-muted-foreground">总{selectedType}</p>
                <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
              </div>

              {/* Category labels */}
              {pieData.slice(0, 2).map((entry, index) => (
                <div
                  key={entry.name}
                  className={`absolute text-xs ${
                    index === 0 ? 'top-6 right-6' : 'bottom-6 left-6'
                  }`}
                >
                  <span className="font-medium">
                    {displayMode==='percent' ? `${entry.percentage.toFixed(1)}%` : new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(entry.value)}
                  </span>
                  <br />
                  <span className="text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>

            {/* Type selector */}
            <div className="flex gap-2 mb-4">
              {types.map((type) => (
                <Button
                  key={type}
                  variant={selectedType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedType(type)}
                >
                  {type}
                </Button>
              ))}
            </div>

            {/* Category list */}
            <div className="space-y-3">
              {categoryData.map((category, index) => {
                const percentage = totalAmount > 0 ? (category.amount / totalAmount * 100) : 0;
                // 计算环比/同比变化
                const baseMap = compareMode==='mom' ? baseSumsMoM : baseSumsYoY;
                const baseVal = baseMap[category.name] || 0;
                const curVal = category.amount;
                let changeText = '';
                let signState: 1 | 0 | -1 = 0; // 1=up,0=flat/na,-1=down
                if (baseVal === 0) {
                  if (curVal > 0) { changeText = '新增'; signState = 1; }
                  else { changeText = '—'; signState = 0; }
                } else {
                  const diffRatio = ((curVal - baseVal) / baseVal) * 100;
                  changeText = `${diffRatio >= 0 ? '+' : ''}${diffRatio.toFixed(1)}%`;
                  signState = diffRatio > 0 ? 1 : diffRatio < 0 ? -1 : 0;
                }
                return (
                  <button
                    key={category.name}
                    className="w-full flex items-center justify-between"
                    onClick={() => openCategory(category, COLORS[index % COLORS.length])}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                        style={{ backgroundColor: `${COLORS[index % COLORS.length]}20` }}
                      >
                        {category.icon}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{category.name} {percentage.toFixed(2)}%</p>
                        <div 
                          className="h-1 bg-current rounded-full mt-1"
                          style={{ 
                            width: `${percentage}%`,
                            color: COLORS[index % COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <TrendingUp className={`w-3 h-3 ${signState>0?'text-green-500':signState<0?'text-red-500':'text-muted-foreground'}`} />
                        <span className={`text-xs ${signState>0?'text-green-600':signState<0?'text-red-600':'text-muted-foreground'}`}>
                          {changeText}
                        </span>
                      </div>
                      <p className="text-lg font-medium">
                        {displayMode==='percent' 
                          ? `${percentage.toFixed(1)}%`
                          : formatCurrency(category.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">{category.count}笔</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground ml-2" />
                  </button>
                );
              })}
            </div>

            {/* Drilldown dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {selectedType} · {activeCategory?.name}（{dialogTransactions.length} 笔）
                  </DialogTitle>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-auto">
                  <TransactionList transactions={dialogTransactions as any} />
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>暂无{selectedType}数据</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CategoryBreakdown;
