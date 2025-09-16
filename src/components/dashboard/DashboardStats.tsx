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
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-2xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">累计攒钱</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSavings(!showSavings)}
            className="h-8 w-8 hover:bg-blue-100 dark:hover:bg-blue-900/50"
          >
            {showSavings ? (
              <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <EyeOff className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            )}
          </Button>
        </div>
        <div className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
          {showSavings ? formatCurrency(stats.totalSavings) : '****'}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          总储蓄金额
        </p>
      </div>

      {/* 本周期结余 - 移动端 */}
      <div className="md:hidden bg-white dark:bg-gray-900 rounded-2xl p-6 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${netPositive ? 'bg-green-500' : 'bg-red-500'}`}></div>
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
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">总收入</div>
            <div className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(stats.monthlyIncome)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">本周期支出</div>
            <div className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(stats.monthlyExpense)}</div>
          </div>
        </div>
      </div>

      {/* 桌面端三列布局 */}
      <div className="hidden md:grid gap-6 grid-cols-3">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 animate-fade-in hover:shadow-lg transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">总余额</span>
            </div>
            <Wallet className="h-5 w-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {formatCurrency(stats.totalBalance)}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            所选周期净额
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 animate-fade-in hover:shadow-lg transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">本周期收入</span>
            </div>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
            {formatCurrency(stats.monthlyIncome)}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            当前周期收入
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 animate-fade-in hover:shadow-lg transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">本周期支出</span>
            </div>
            <TrendingDown className="h-5 w-5 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
            {formatCurrency(stats.monthlyExpense)}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            当前周期支出
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
