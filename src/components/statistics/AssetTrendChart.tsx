import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";

interface AssetTrendChartProps {
  transactions: any[];
  accounts: any[];
  currentDate: Date;
  startDate: Date | null;
  endDate: Date | null;
  selectedPeriod?: string;
}

const AssetTrendChart = ({ transactions, accounts, currentDate, startDate, endDate }: AssetTrendChartProps) => {
  const [selectedType, setSelectedType] = useState("净资产");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const types = ["净资产", "总资产", "总负债"];

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

  // 先计算累计攒钱（最新的净资产）
  const allTransactionsSorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let totalCumulativeIncome = 0;
  let totalCumulativeExpense = 0;
  
  for (const transaction of allTransactionsSorted) {
    const amount = Number(transaction.amount);
    if (transaction.type === 'income') {
      totalCumulativeIncome += amount;
    } else if (transaction.type === 'expense') {
      totalCumulativeExpense += Math.abs(amount);
    }
  }
  
  const finalCumulativeSavings = totalCumulativeIncome - totalCumulativeExpense;

  const dailyData = daysInRange.map(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    
    // 计算从当前日期到最后日期的交易（需要减去的部分）
    const transactionsAfterDay = transactions.filter(t => t.date > dayStr);
    let incomeAfterDay = 0;
    let expenseAfterDay = 0;
    
    for (const transaction of transactionsAfterDay) {
      const amount = Number(transaction.amount);
      if (transaction.type === 'income') {
        incomeAfterDay += amount;
      } else if (transaction.type === 'expense') {
        expenseAfterDay += Math.abs(amount);
      }
    }
    
    // 当日净资产 = 最终累计攒钱 - 之后的结余变化
    const balanceAfterDay = incomeAfterDay - expenseAfterDay;
    const netAssets = finalCumulativeSavings - balanceAfterDay;
    
    const totalAssets = Math.max(netAssets, 0);
    const totalLiabilities = Math.max(-netAssets, 0);

    return {
      date: format(day, 'M-d'),
      fullDate: dayStr,
      netAssets,
      totalAssets,
      totalLiabilities,
      value: selectedType === "净资产" ? netAssets : selectedType === "总资产" ? totalAssets : totalLiabilities
    };
  });

  // Determine display point: active (touch/hover) or first day of month
  const defaultDay = dailyData[0];
  const display = activeIndex != null && dailyData[activeIndex] ? dailyData[activeIndex] : defaultDay;
  const currentValue = display?.value || 0;
  const currentDateStr = (() => {
    if (display && display.fullDate) {
      const d = new Date(display.fullDate);
      return isNaN(d.getTime()) ? format(rangeStart, 'M月d日') : format(d, 'M月d日');
    }
    return format(currentDate, 'M月d日');
  })();

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
          <span className="text-lg">📈</span>
          净资产趋势图
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Current value display */}
        <div className="mb-4 text-center">
          <p className="text-sm font-medium">
            {currentDateStr} {formatCurrency(currentValue)}
          </p>
        </div>

        {/* Chart */}
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={dailyData}
              onMouseMove={(state: any) => {
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
                width={48}
                tickFormatter={formatTick}
                axisLine={false}
                tickLine={false}
                fontSize={12}
              />
              <Tooltip 
                cursor={{ stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4 4' }}
                formatter={(value: any) => [formatCurrency(Number(value)), selectedType]}
                labelFormatter={(label: any, payload: any) => {
                  const p = payload && payload[0] ? payload[0].payload : null;
                  if (p && p.fullDate) {
                    const d = new Date(p.fullDate);
                    return isNaN(d.getTime()) ? format(rangeStart, 'yyyy-MM-dd') : format(d, 'yyyy-MM-dd');
                  }
                  return label;
                }}
              />
              <ReferenceLine y={0} stroke="#ddd" />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#f59e0b" 
                strokeWidth={2}
                dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: '#f59e0b' }}
              />
            </LineChart>
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

export default AssetTrendChart;
