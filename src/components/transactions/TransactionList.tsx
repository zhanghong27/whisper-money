import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Calendar, Info, Edit, Trash2 } from "lucide-react";
import { format, isThisYear, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EditTransactionDialog from "./EditTransactionDialog";
import SwipeableTransactionItem from "./SwipeableTransactionItem";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description: string;
  date: string;
  occurredAt?: string;
  source?: string;
  category_id?: string;
  account_id?: string;
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
  onTransactionUpdated?: () => void;
  onTransactionDeleted?: () => void;
}

const TransactionList = ({ transactions, onTransactionUpdated, onTransactionDeleted }: TransactionListProps) => {
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

  const getSourceIcon = (source?: string) => {
    switch (source) {
      case 'wechat':
        return '💬';
      case 'alipay':
        return '🅰️';
      case 'cmb':
        return '🏦';
      case 'boc':
        return '🏛️';
      case 'manual':
      default:
        return '💰';
    }
  };

  const getSourceName = (source?: string) => {
    switch (source) {
      case 'wechat':
        return '微信';
      case 'alipay':
        return '支付宝';
      case 'cmb':
        return '招商银行储蓄卡';
      case 'boc':
        return '中国银行储蓄卡';
      case 'manual':
      default:
        return '现金';
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center">
        <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400 mb-2">暂无交易记录</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">开始记录您的第一笔交易吧！</p>
      </div>
    );
  }

  // Group transactions by date (yyyy-MM-dd)
  const groups = transactions.reduce((acc: Record<string, Transaction[]>, t) => {
    const key = t.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  // Sort groups by date desc and items by date desc
  const sortedKeys = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));
  sortedKeys.forEach(k => {
    groups[k].sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return tb - ta;
    });
  });

  const formatHeader = (dateStr: string) => {
    const d = parseISO(dateStr);
    const weekday = format(d, 'EEEE', { locale: zhCN });
    if (isThisYear(d)) return `${format(d, 'MM/dd')} ${weekday}`;
    return `${format(d, 'yyyy/MM/dd')} ${weekday}`;
  };

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);

  const showDetail = (t: Transaction) => {
    setActive(t);
    setOpen(true);
  };

  const handleEdit = (t: Transaction) => {
    setEditTransaction(t);
    setEditOpen(true);
  };

  const handleDelete = async (t: Transaction) => {
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', t.id);

      if (error) throw error;

      toast.success('交易记录已删除');
      onTransactionDeleted?.();
    } catch (error) {
      console.error('删除交易记录失败:', error);
      toast.error('删除失败，请重试');
    }
  };

  return (
    <>
      <div className="space-y-4">
        {sortedKeys.map(key => {
          const items = groups[key];
          const dayExpense = items
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);
          return (
            <div key={key} className="space-y-3">
              {/* Date header */}
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{formatHeader(key)}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">支出: {formatCurrency(dayExpense)}</span>
              </div>
              {/* Transaction items */}
              <div className="space-y-2">
                {items.map((transaction) => (
                  <SwipeableTransactionItem
                    key={transaction.id}
                    transaction={transaction}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDetail={showDetail}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              交易详情
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>金额</span>
                <span className={`font-semibold ${
                  active.type === 'income' ? 'text-success' : active.type === 'expense' ? 'text-destructive' : ''
                }`}>
                  {active.type === 'income' ? '+' : active.type === 'expense' ? '-' : ''}
                  {formatCurrency(Math.abs(active.amount))}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>类型</span>
                <span>{getTypeText(active.type)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>日期</span>
                <span>{format(parseISO(active.date), 'yyyy-MM-dd')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>分类</span>
                <span>{active.category.icon} {active.category.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>来源</span>
                <span>{getSourceIcon(active.source)} {getSourceName(active.source)}</span>
              </div>
              {active.description && (
                <div>
                  <div className="text-muted-foreground">备注</div>
                  <div className="mt-1 break-words">{active.description}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        transaction={editTransaction}
        onTransactionUpdated={() => {
          onTransactionUpdated?.();
          setEditOpen(false);
          setEditTransaction(null);
        }}
      />
    </>
  );
};

export default TransactionList;
