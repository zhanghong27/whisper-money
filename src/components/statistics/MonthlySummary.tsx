import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";

interface MonthlySummaryProps {
  transactions: any[];
  currentDate: Date;
}

const MonthlySummary = ({ transactions, currentDate }: MonthlySummaryProps) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
  };

  // Calculate monthly totals
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const balance = totalIncome - totalExpense;

  // Calculate daily averages
  const daysInMonth = endOfMonth(currentDate).getDate();
  const avgExpense = totalExpense / daysInMonth;
  const avgIncome = totalIncome / daysInMonth;
  const avgBalance = balance / daysInMonth;

  // Get unique transaction dates for daily breakdown
  const transactionDates = [...new Set(transactions.map(t => t.date))].sort((a, b) => b.localeCompare(a));

  const getDailyStats = (date: string) => {
    const dayTransactions = transactions.filter(t => t.date === date);
    const dayExpense = dayTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const dayIncome = dayTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const dayBalance = dayIncome - dayExpense;

    return { dayExpense, dayIncome, dayBalance };
  };

  const monthName = format(currentDate, 'M月');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span className="text-lg">📋</span>
          月账单汇总 (CNY)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">日期</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">支出</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">收入</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">结余</th>
              </tr>
            </thead>
            <tbody>
              {/* Total row */}
              <tr className="border-b">
                <td className="py-2 px-3 font-medium">总计</td>
                <td className="text-right py-2 px-3">{formatCurrency(totalExpense)}</td>
                <td className="text-right py-2 px-3">{formatCurrency(totalIncome)}</td>
                <td className={`text-right py-2 px-3 ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(balance)}
                </td>
              </tr>
              
              {/* Average row */}
              <tr className="border-b">
                <td className="py-2 px-3 font-medium">日均</td>
                <td className="text-right py-2 px-3">{formatCurrency(avgExpense)}</td>
                <td className="text-right py-2 px-3">{formatCurrency(avgIncome)}</td>
                <td className={`text-right py-2 px-3 ${avgBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(avgBalance)}
                </td>
              </tr>
              
              {/* Daily rows */}
              {transactionDates.slice(0, 5).map(date => {
                const { dayExpense, dayIncome, dayBalance } = getDailyStats(date);
                const displayDate = format(new Date(date), 'M-d');
                
                return (
                  <tr key={date} className="border-b">
                    <td className="py-2 px-3">{displayDate}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(dayExpense)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(dayIncome)}</td>
                    <td className={`text-right py-2 px-3 ${dayBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(dayBalance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default MonthlySummary;