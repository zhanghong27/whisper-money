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
  const [showSavings, setShowSavings] = useState(false);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: stats.currency,
    }).format(amount);
  };

  const netIncome = stats.monthlyIncome - stats.monthlyExpense; // 本周期结余
  const netPositive = netIncome >= 0;
  const expenseNonNegative = stats.monthlyExpense >= 0;

  return (
    <div className="space-y-6">
      {/* 累计攒钱 - 主要展示区域 */}
      <div className="bg-gradient-cute rounded-3xl p-6 shadow-cute hover:shadow-elevated transition-all duration-300 hover:scale-105">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💎</span>
            <span className="text-sm font-medium text-white">智能存钱罐</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSavings(!showSavings)}
            className="h-8 w-8 hover:bg-white/20 rounded-full transition-all duration-300"
          >
            {showSavings ? (
              <Eye className="h-4 w-4 text-white" />
            ) : (
              <EyeOff className="h-4 w-4 text-white" />
            )}
          </Button>
        </div>
        <div className="text-3xl md:text-4xl font-bold text-white mb-2">
          {showSavings ? formatCurrency(stats.totalSavings) : '✨ ****'}
        </div>
        <p className="text-sm text-white/80">
          🌟 总储蓄金额
        </p>
      </div>

      {/* 本周期结余 - 移动端 */}
      <div className="md:hidden bg-gradient-soft rounded-3xl p-6 shadow-card hover:shadow-elevated transition-all duration-300">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">{netPositive ? '🎉' : '😅'}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">本周期结余</span>
          {netPositive ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </div>
        <div className={`text-3xl font-bold mb-6 ${netPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrency(netIncome)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center bg-success-light rounded-2xl p-3">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">💰 总收入</div>
            <div className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(stats.monthlyIncome)}</div>
          </div>
          <div className="text-center bg-danger-light rounded-2xl p-3">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">💸 本周期支出</div>
            <div className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(stats.monthlyExpense)}</div>
          </div>
        </div>
      </div>

      {/* 桌面端三列布局 */}
      <div className="hidden md:grid gap-6 grid-cols-3">
        <div className="bg-gradient-soft rounded-3xl p-6 shadow-card hover:shadow-elevated transition-all duration-300 hover:scale-105">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">👛</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">总余额</span>
            </div>
            <Wallet className="h-5 w-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {formatCurrency(stats.totalBalance)}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💼 所选周期净额
          </p>
        </div>

        <div className="bg-gradient-success rounded-3xl p-6 shadow-card hover:shadow-elevated transition-all duration-300 hover:scale-105">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">💰</span>
              <span className="text-sm font-medium text-white">本周期收入</span>
            </div>
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div className="text-2xl font-bold text-white mb-2">
            {formatCurrency(stats.monthlyIncome)}
          </div>
          <p className="text-sm text-white/80">
            🌈 当前周期收入
          </p>
        </div>

        <div className="bg-gradient-to-br from-red-400 to-pink-500 rounded-3xl p-6 shadow-card hover:shadow-elevated transition-all duration-300 hover:scale-105">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">💸</span>
              <span className="text-sm font-medium text-white">本周期支出</span>
            </div>
            <TrendingDown className="h-5 w-5 text-white" />
          </div>
          <div className="text-2xl font-bold text-white mb-2">
            {formatCurrency(stats.monthlyExpense)}
          </div>
          <p className="text-sm text-white/80">
            🛍️ 当前周期支出
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
