import { cn } from '@/lib/utils';
import { UI } from '@/lib/i18n';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div
      className={cn(
        'rounded-full border-primary border-t-transparent animate-spin',
        sizeClasses[size],
        className
      )}
    />
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = UI.LOADING, className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 gap-4', className)}>
      <LoadingSpinner size="lg" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('bg-muted animate-pulse rounded-lg', className)} />
  );
}

export function CardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('bg-card rounded-xl p-4 space-y-4', className)}>
      <div className="flex items-center gap-4">
        <Skeleton className="w-16 h-16 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function ListSkeleton({ count = 3, className }: { count?: number } & SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ScoreSkeleton() {
  return (
    <div className="flex items-center gap-6 animate-pulse">
      <Skeleton className="w-24 h-24 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  );
}
