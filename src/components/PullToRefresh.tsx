import { ReactNode, useRef, useState, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
  disabled?: boolean;
}

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

export function PullToRefresh({ 
  children, 
  onRefresh, 
  className,
  disabled = false 
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const hasTriggeredHapticRef = useRef(false);
  
  const haptic = useHapticFeedback();

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Only enable pull-to-refresh when scrolled to top
    if (container.scrollTop > 0) return;
    
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    setIsPulling(true);
    hasTriggeredHapticRef.current = false;
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;
    
    currentYRef.current = e.touches[0].clientY;
    const diff = currentYRef.current - startYRef.current;
    
    if (diff > 0) {
      // Apply resistance curve for natural feel
      const resistance = 0.5;
      const distance = Math.min(diff * resistance, MAX_PULL);
      setPullDistance(distance);
      
      // Haptic feedback when crossing threshold
      if (distance >= PULL_THRESHOLD && !hasTriggeredHapticRef.current) {
        haptic.medium();
        hasTriggeredHapticRef.current = true;
      } else if (distance < PULL_THRESHOLD && hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = false;
      }
      
      // Prevent default scroll behavior when pulling
      if (distance > 10) {
        e.preventDefault();
      }
    }
  }, [isPulling, disabled, isRefreshing, haptic]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    
    setIsPulling(false);
    
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      haptic.success();
      
      try {
        await onRefresh();
      } catch (error) {
        haptic.error();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, pullDistance, isRefreshing, onRefresh, haptic]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const rotation = progress * 180 + (isRefreshing ? 360 : 0);

  return (
    <div 
      ref={containerRef}
      className={cn('relative overflow-auto', className)}
      style={{ 
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {/* Pull indicator */}
      <div 
        className={cn(
          'absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center',
          'transition-opacity duration-200',
          (pullDistance > 10 || isRefreshing) ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          top: Math.max(pullDistance - 40, 8),
        }}
      >
        <div 
          className={cn(
            'w-10 h-10 rounded-full bg-card shadow-lg border border-border',
            'flex items-center justify-center',
            isRefreshing && 'animate-pulse'
          )}
        >
          <RefreshCw 
            className={cn(
              'h-5 w-5 text-primary transition-transform duration-200',
              isRefreshing && 'animate-spin'
            )}
            style={{ 
              transform: `rotate(${rotation}deg)`,
              opacity: progress
            }}
          />
        </div>
      </div>
      
      {/* Content with pull transform */}
      <div 
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {children}
      </div>
    </div>
  );
}
