import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { BarChart3 } from "lucide-react";

interface ExpenseChartProps {
  transactions: any[];
  currentDate: Date;
  startDate: Date | null;
  endDate: Date | null;
  selectedPeriod?: string;
}

const ExpenseChart = ({ transactions, currentDate, startDate, endDate }: ExpenseChartProps) => {
  const [selectedType, setSelectedType] = useState("支出");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const types = ["支出", "收入", "结余"];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
  };

  // Determine date range for chart
  let rangeStart = startDate ?? startOfMonth(currentDate);
  let rangeEnd = endDate ?? endOfMonth(currentDate);

  // If "全部" 未指定范围，则基于交易数据推断
  if (!startDate || !endDate) {
    if (transactions.length > 0) {
      const dates = transactions.map(t => new Date(t.date));
      dates.sort((a, b) => a.getTime() - b.getTime());
      rangeStart = dates[0];
      rangeEnd = dates[dates.length - 1];
    } else {
      rangeStart = startOfMonth(currentDate);
      rangeEnd = endOfMonth(currentDate);
    }
  }

  const daysInRange = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const dailyData = daysInRange.map(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayTransactions = transactions.filter(t => t.date === dayStr);
    
    const expense = Math.abs(dayTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0));
    
    const income = dayTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const balance = income - expense;

    return {
      date: format(day, 'M-d'),
      fullDate: dayStr,
      expense,
      income,
      balance,
      value: selectedType === "支出" ? expense : selectedType === "收入" ? income : balance
    };
  });

  // Calculate average
  const totalValue = dailyData.reduce((sum, d) => sum + d.value, 0);
  const average = totalValue / dailyData.length;

  // Active day (hover/touch) and default day (first day of month)
  const activeDay = activeIndex != null ? dailyData[activeIndex] : null;
  const defaultDay = dailyData[0] || { value: 0, date: '', fullDate: '' };

  const formatDayLabel = (fullDate: string) => {
    const d = new Date(fullDate);
    return isNaN(d.getTime()) ? format(rangeStart, 'M月d日') : format(d, 'M月d日');
  };

  const formatTick = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
    if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return `${Math.round(v)}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span className="text-lg">📊</span>
          支出统计图
          <span className="text-xs text-muted-foreground ml-2">
            平均值: {formatCurrency(average)}
          </span>
        </CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {/* Active or first-day display - always show, even when value is 0 */}
        <div className="mb-4 text-sm">
          <span className="font-medium">
            {activeDay
              ? `${formatDayLabel(activeDay.fullDate)} ${formatCurrency(activeDay.value)}`
              : `${formatDayLabel(defaultDay.fullDate)} ${formatCurrency(defaultDay.value)}`}
          </span>
        </div>

        {/* Chart */}
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={dailyData}
              onMouseMove={(state: any) => {
                if (state && state.activeTooltipIndex != null) setActiveIndex(state.activeTooltipIndex);
              }}
              onTouchStart={(state: any) => {
                if (state && state.activeTooltipIndex != null) setActiveIndex(state.activeTooltipIndex);
              }}
              onTouchMove={(state: any) => {
                if (state && state.activeTooltipIndex != null) setActiveIndex(state.activeTooltipIndex);
              }}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                fontSize={12}
              />
              <YAxis 
                width={40}
                tickFormatter={formatTick}
                axisLine={false}
                tickLine={false}
                fontSize={12}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                formatter={(value: any) => [formatCurrency(Number(value)), selectedType]}
                labelFormatter={(label: any, payload: any) => {
                  const idx = payload && payload[0] ? payload[0].payload : null;
                  if (idx && idx.fullDate) {
                    const d = new Date(idx.fullDate);
                    return isNaN(d.getTime()) ? format(rangeStart, 'yyyy-MM-dd') : format(d, 'yyyy-MM-dd');
                  }
                  return label;
                }}
              />
              <Bar 
                dataKey="value" 
                fill={selectedType === "支出" ? "#ef4444" : selectedType === "收入" ? "#10b981" : "#6b7280"} 
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Type selector */}
        <div className="flex gap-2 mt-4">
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
      </CardContent>
    </Card>
  );
};

export default ExpenseChart;
