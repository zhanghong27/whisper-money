import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Calendar } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description: string;
  date: string;
  category: {
    name: string;
    icon: string;
    color: string;
  };
  account: {
    name: string;
    icon: string;
  };
}

interface TransactionListProps {
  transactions: Transaction[];
  onEditTransaction?: (transaction: Transaction) => void;
}

const TransactionList = ({ transactions, onEditTransaction }: TransactionListProps) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
  };

  type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

  const getTypeColor = (type: Transaction['type']): BadgeVariant => {
    switch (type) {
      case 'income':
        return 'default'
      case 'expense':
        return 'destructive'
      case 'transfer':
        return 'secondary'
      default:
        return 'secondary'
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'income':
        return '收入';
      case 'expense':
        return '支出';
      case 'transfer':
        return '转账';
      default:
        return '未知';
    }
  };

  if (transactions.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">暂无交易记录</p>
          <p className="text-sm text-muted-foreground">开始记录您的第一笔交易吧！</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          交易记录
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                style={{ backgroundColor: transaction.category.color + '20' }}
              >
                {transaction.category.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{transaction.description || transaction.category.name}</span>
                  <Badge variant={getTypeColor(transaction.type)} className="text-xs">
                    {getTypeText(transaction.type)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{transaction.account.icon} {transaction.account.name}</span>
                  <span>•</span>
                  <span>{format(new Date(transaction.date), 'MM月dd日', { locale: zhCN })}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <span 
                className={`font-bold ${
                  transaction.type === 'income' 
                    ? 'text-success' 
                    : transaction.type === 'expense' 
                    ? 'text-destructive' 
                    : 'text-foreground'
                }`}
              >
                {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : ''}
                {formatCurrency(Math.abs(transaction.amount))}
              </span>
              {onEditTransaction && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => onEditTransaction(transaction)}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default TransactionList;
