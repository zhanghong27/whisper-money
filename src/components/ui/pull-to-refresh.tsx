import { useState, useRef, useCallback, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
}

const PullToRefresh = ({ 
  onRefresh, 
  children, 
  threshold = 80,
  disabled = false 
}: PullToRefreshProps) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) return;
    
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) return;
    
    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY.current);
    
    if (distance > 0) {
      e.preventDefault();
      // Apply resistance curve
      const resistance = Math.min(distance * 0.5, threshold * 1.5);
      setPullDistance(resistance);
    }
  }, [isPulling, disabled, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || disabled) return;
    
    setIsPulling(false);
    
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
  }, [isPulling, disabled, pullDistance, threshold, isRefreshing, onRefresh]);

  const refreshOpacity = Math.min(pullDistance / threshold, 1);
  const shouldShowRefresh = pullDistance >= threshold || isRefreshing;

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateY(${isPulling ? pullDistance : isRefreshing ? 60 : 0}px)`,
        transition: isPulling ? 'none' : 'transform 0.3s ease-out'
      }}
    >
      {/* Pull to refresh indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex items-center justify-center"
        style={{
          height: '60px',
          transform: `translateY(-60px)`,
          opacity: refreshOpacity
        }}
      >
        <div className="flex items-center gap-2 text-primary">
          <RefreshCw 
            className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''} ${
              shouldShowRefresh ? 'rotate-180' : ''
            } transition-transform duration-200`}
          />
          <span className="text-sm font-medium">
            {isRefreshing ? '正在刷新...' : shouldShowRefresh ? '松开刷新' : '下拉刷新'}
          </span>
        </div>
      </div>
      
      {children}
    </div>
  );
};

export default PullToRefresh;