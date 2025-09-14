import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { BarChart3 } from "lucide-react";

interface ExpenseChartProps {
  transactions: any[];
  currentDate: Date;
}

const ExpenseChart = ({ transactions, currentDate }: ExpenseChartProps) => {
  const [selectedType, setSelectedType] = useState("支出");
  const types = ["支出", "收入", "结余"];

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

  const dailyData = daysInMonth.map(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayTransactions = transactions.filter(t => t.date === dayStr);
    
    const expense = dayTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
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

  // Find the highest transaction for display
  const highestDay = dailyData.reduce((max, day) => 
    day.value > max.value ? day : max, dailyData[0] || { value: 0, date: '', fullDate: '' }
  );

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
        {/* Highest transaction display */}
        {highestDay.value > 0 && (
          <div className="mb-4 text-sm">
            <span className="font-medium">
              {format(new Date(highestDay.fullDate), 'M月d日')} {formatCurrency(highestDay.value)}
            </span>
            <span className="text-muted-foreground ml-1">{'>'}</span>
          </div>
        )}

        {/* Chart */}
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                fontSize={12}
                domain={['dataMin', 'dataMax']}
              />
              <YAxis hide />
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