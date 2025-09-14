import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ChevronRight, TrendingUp } from "lucide-react";

interface CategoryBreakdownProps {
  transactions: any[];
  categories: any[];
}

interface CategoryData {
  name: string;
  amount: number;
  count: number;
  icon: string;
  color: string;
}

const CategoryBreakdown = ({ transactions, categories }: CategoryBreakdownProps) => {
  const [selectedType, setSelectedType] = useState("支出");
  const types = ["支出", "收入"];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
  };

  // Filter transactions by type
  const filteredTransactions = transactions.filter(t => 
    selectedType === "支出" ? t.type === 'expense' : t.type === 'income'
  );

  // Group by category
  const categoryStats: Record<string, CategoryData> = {};
  
  filteredTransactions.forEach(transaction => {
    const categoryName = transaction.categories?.name || '其他';
    const categoryIcon = transaction.categories?.icon || '📂';
    const categoryColor = transaction.categories?.color || '#6B7280';
    
    if (!categoryStats[categoryName]) {
      categoryStats[categoryName] = {
        name: categoryName,
        amount: 0,
        count: 0,
        icon: categoryIcon,
        color: categoryColor
      };
    }
    
    categoryStats[categoryName].amount += Number(transaction.amount);
    categoryStats[categoryName].count += 1;
  });

  const categoryData = Object.values(categoryStats);
  const totalAmount = categoryData.reduce((sum, cat) => sum + cat.amount, 0);

  // Prepare data for pie chart
  const pieData = categoryData.map((cat) => ({
    name: cat.name,
    value: cat.amount,
    percentage: totalAmount > 0 ? (cat.amount / totalAmount * 100) : 0,
    color: cat.color
  }));

  // Colors for pie chart
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span className="text-lg">📊</span>
          支出分类详情
          <span className="text-xs text-muted-foreground ml-auto">显示环比金额 ⇄</span>
          <span className="text-xs text-muted-foreground">一级分类 ⇄</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalAmount > 0 ? (
          <>
            {/* Pie Chart */}
            <div className="relative h-48 w-full mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xs text-muted-foreground">总{selectedType}</p>
                <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
              </div>

              {/* Category labels */}
              {pieData.slice(0, 2).map((entry, index) => (
                <div
                  key={entry.name}
                  className={`absolute text-xs ${
                    index === 0 ? 'top-6 right-6' : 'bottom-6 left-6'
                  }`}
                >
                  <span className="font-medium">{entry.percentage.toFixed(2)}%</span>
                  <br />
                  <span className="text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>

            {/* Type selector */}
            <div className="flex gap-2 mb-4">
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

            {/* Category list */}
            <div className="space-y-3">
              {categoryData.map((category, index) => {
                const percentage = totalAmount > 0 ? (category.amount / totalAmount * 100) : 0;
                return (
                  <div key={category.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                        style={{ backgroundColor: `${COLORS[index % COLORS.length]}20` }}
                      >
                        {category.icon}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{category.name} {percentage.toFixed(2)}%</p>
                        <div 
                          className="h-1 bg-current rounded-full mt-1"
                          style={{ 
                            width: `${percentage}%`,
                            color: COLORS[index % COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-destructive" />
                        <span className="text-xs text-destructive">{formatCurrency(category.amount)}</span>
                      </div>
                      <p className="text-lg font-medium">{formatCurrency(category.amount)}</p>
                      <p className="text-xs text-muted-foreground">{category.count}笔</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground ml-2" />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>暂无{selectedType}数据</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CategoryBreakdown;