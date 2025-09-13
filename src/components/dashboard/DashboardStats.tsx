import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface StatsData {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  totalSavings: number;
  currency: string;
}

interface DashboardStatsProps {
  stats: StatsData;
}

const DashboardStats = ({ stats }: DashboardStatsProps) => {
  const [showSavings, setShowSavings] = useState(true);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: stats.currency,
    }).format(amount);
  };

  const netIncome = stats.monthlyIncome - stats.monthlyExpense;

  return (
    <div className="space-y-4">
      {/* 累计攒钱卡片 */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">累计攒钱</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSavings(!showSavings)}
            className="h-6 w-6"
          >
            {showSavings ? (
              <Eye className="h-4 w-4 text-muted-foreground" />
            ) : (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {showSavings ? formatCurrency(stats.totalSavings) : '****'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            总储蓄金额
          </p>
        </CardContent>
      </Card>

      {/* 其他三个统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总余额</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              所选月份净额（收入-支出）
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本月收入</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {formatCurrency(stats.monthlyIncome)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              当前月份收入
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本月支出</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(stats.monthlyExpense)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              当前月份支出
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardStats;
