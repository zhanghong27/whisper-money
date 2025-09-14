import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

interface StatsOverviewProps {
  transactions: any[];
  accounts: any[];
}

const StatsOverview = ({ transactions, accounts }: StatsOverviewProps) => {
  // Calculate statistics
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const balance = totalIncome - totalExpense;
  
  const daysInMonth = new Date().getDate(); // Simplified for demo
  const avgDailyExpense = totalExpense / daysInMonth;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
  };

  const StatCard = ({ title, children, icon }: { title: string; children: React.ReactNode; icon?: string }) => (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          {title}
        </CardTitle>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Income/Expense Statistics */}
      <StatCard title="收支统计" icon="📊">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">支出 {'>'}  </p>
            <p className="text-lg font-medium">{formatCurrency(totalExpense)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">收入 {'>'}</p>
            <p className="text-lg font-medium">{formatCurrency(totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">结余 {'>'}</p>
            <p className={`text-lg font-medium ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(balance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">日均支出 {'>'}</p>
            <p className="text-lg font-medium">{formatCurrency(avgDailyExpense)}</p>
          </div>
        </div>
      </StatCard>

      {/* Reimbursement Statistics */}
      <StatCard title="报销统计" icon="📋">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">待报销 {'>'}</p>
            <p className="text-lg font-medium">{formatCurrency(0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">报销入账 {'>'}</p>
            <p className="text-lg font-medium">{formatCurrency(0)}</p>
          </div>
        </div>
      </StatCard>

      {/* Transfer Statistics */}
      <StatCard title="流转统计" icon="💳">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">还款 {'>'}</p>
            <p className="text-lg font-medium">{formatCurrency(0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">收款 {'>'}</p>
            <p className="text-lg font-medium">{formatCurrency(0)}</p>
          </div>
        </div>
      </StatCard>
    </div>
  );
};

export default StatsOverview;