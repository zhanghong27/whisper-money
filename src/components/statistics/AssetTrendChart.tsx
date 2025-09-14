import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";

interface AssetTrendChartProps {
  transactions: any[];
  accounts: any[];
  currentDate: Date;
}

const AssetTrendChart = ({ transactions, accounts, currentDate }: AssetTrendChartProps) => {
  const [selectedType, setSelectedType] = useState("净资产");
  const types = ["净资产", "总资产", "总负债"];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
  };

  // Generate daily data for the month
  const startDate = startOfMonth(currentDate);
  const endDate = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });

  // Calculate initial balance (sum of all accounts)
  const initialBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

  const dailyData = daysInMonth.map(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    
    // Calculate cumulative transactions up to this day
    const transactionsUpToDay = transactions.filter(t => t.date <= dayStr);
    const cumulativeIncome = transactionsUpToDay
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const cumulativeExpense = transactionsUpToDay
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const netAssets = initialBalance + cumulativeIncome - cumulativeExpense;
    const totalAssets = Math.max(netAssets, 0); // Simplified calculation
    const totalLiabilities = Math.max(-netAssets, 0); // Simplified calculation

    return {
      date: format(day, 'M-d'),
      fullDate: dayStr,
      netAssets,
      totalAssets,
      totalLiabilities,
      value: selectedType === "净资产" ? netAssets : selectedType === "总资产" ? totalAssets : totalLiabilities
    };
  });

  // Find current value for display
  const currentValue = dailyData[dailyData.length - 1]?.value || 0;
  const currentDateStr = format(currentDate, 'M月d日');

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
            <LineChart data={dailyData}>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                fontSize={12}
              />
              <YAxis hide />
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