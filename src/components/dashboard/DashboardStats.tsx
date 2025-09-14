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
    <div className="space-y-3 md:space-y-4">
      {/* 累计攒钱卡片 - 移动端优化 */}
      <Card className="shadow-card animate-fade-in">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-4 md:px-6">
          <CardTitle className="text-sm font-medium">累计攒钱</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSavings(!showSavings)}
            className="h-8 w-8 hover-scale"
          >
            {showSavings ? (
              <Eye className="h-4 w-4 text-muted-foreground" />
            ) : (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CardHeader>
        <CardContent className="px-4 md:px-6 pb-4">
          <div className="text-xl md:text-2xl font-bold">
            {showSavings ? formatCurrency(stats.totalSavings) : '****'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            总储蓄金额
          </p>
        </CardContent>
      </Card>

      {/* 移动端单卡片布局，桌面端保持三卡片 */}
      <div className="md:hidden">
        <Card className="shadow-card animate-fade-in">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              总支出
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-destructive mb-4">
              {formatCurrency(stats.monthlyIncome)}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                总收入 <span className="font-medium text-success">{formatCurrency(netIncome)}</span>
              </span>
              <span className="text-muted-foreground">
                月结余 <span className={`font-medium ${stats.monthlyExpense >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(stats.monthlyExpense)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 桌面端三卡片布局 */}
      <div className="hidden md:grid gap-4 grid-cols-3">
        <Card className="shadow-card animate-fade-in hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6">
            <CardTitle className="text-sm font-medium">总余额</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-6 pb-4">
            <div className="text-2xl font-bold">{formatCurrency(stats.totalBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              所选月份净额（收入-支出）
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card animate-fade-in hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6">
            <CardTitle className="text-sm font-medium">本月收入</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent className="px-6 pb-4">
            <div className="text-2xl font-bold text-success">
              {formatCurrency(stats.monthlyIncome)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              当前月份收入
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card animate-fade-in hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6">
            <CardTitle className="text-sm font-medium">本月支出</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="px-6 pb-4">
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
