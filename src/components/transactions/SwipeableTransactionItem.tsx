import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";
import { format, isThisYear, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description: string;
  date: string;
  source?: string;
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

interface SwipeableTransactionItemProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onDetail: (transaction: Transaction) => void;
}

const SwipeableTransactionItem = ({ 
  transaction, 
  onEdit, 
  onDelete, 
  onDetail 
}: SwipeableTransactionItemProps) => {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const itemRef = useRef<HTMLDivElement>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
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

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    
    // Limit swipe range
    const maxSwipe = 150;
    const limitedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diff));
    setDragOffset(limitedDiff);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    const threshold = 60;
    
    if (dragOffset > threshold) {
      // Swipe right - edit action
      onEdit(transaction);
    } else if (dragOffset < -threshold) {
      // Swipe left - delete action
      onDelete(transaction);
    }
    
    setDragOffset(0);
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const currentX = e.clientX;
    const diff = currentX - startX;
    
    const maxSwipe = 150;
    const limitedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diff));
    setDragOffset(limitedDiff);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    
    const threshold = 60;
    
    if (dragOffset > threshold) {
      onEdit(transaction);
    } else if (dragOffset < -threshold) {
      onDelete(transaction);
    }
    
    setDragOffset(0);
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setDragOffset(0);
        setIsDragging(false);
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Action indicators */}
      <div className="absolute inset-y-0 left-0 flex items-center pl-4">
        <div className={`flex items-center gap-2 transition-opacity duration-200 ${
          dragOffset > 60 ? 'opacity-100' : 'opacity-30'
        }`}>
          <Edit className="h-5 w-5 text-blue-500" />
          <span className="text-sm text-blue-500 font-medium">编辑</span>
        </div>
      </div>
      
      <div className="absolute inset-y-0 right-0 flex items-center pr-4">
        <div className={`flex items-center gap-2 transition-opacity duration-200 ${
          dragOffset < -60 ? 'opacity-100' : 'opacity-30'
        }`}>
          <span className="text-sm text-red-500 font-medium">删除</span>
          <Trash2 className="h-5 w-5 text-red-500" />
        </div>
      </div>

      {/* Main transaction item */}
      <div
        ref={itemRef}
        className={`flex items-center gap-4 bg-white dark:bg-gray-900 p-4 transition-transform duration-200 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ transform: `translateX(${dragOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          if (!isDragging && Math.abs(dragOffset) < 10) {
            onDetail(transaction);
          }
        }}
      >
        <div
          className="flex-none w-12 h-12 rounded-xl flex items-center justify-center text-xl"
          style={{ backgroundColor: transaction.category.color + '20' }}
        >
          {transaction.category.icon}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {transaction.description || transaction.category.name}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="whitespace-nowrap">{getSourceIcon(transaction.source)} {getSourceName(transaction.source)}</span>
            <span className="opacity-60">•</span>
            <span className={`text-xs px-2 py-1 rounded-full ${
              transaction.type === 'income' 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : transaction.type === 'expense'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {getTypeText(transaction.type)}
            </span>
          </div>
        </div>
        <div className="flex items-center">
          <span
            className={`font-semibold text-lg ${
              transaction.type === 'income'
                ? 'text-green-600 dark:text-green-400'
                : transaction.type === 'expense'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : ''}
            {formatCurrency(Math.abs(transaction.amount))}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SwipeableTransactionItem;