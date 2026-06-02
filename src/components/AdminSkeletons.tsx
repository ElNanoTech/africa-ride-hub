import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Stats card skeleton - matches KPI card layout
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

// Grid of stat card skeletons
export function StatGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Chart skeleton with header
export function ChartSkeleton({ className, height = 'h-64' }: { className?: string; height?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className={cn('w-full rounded-lg', height)} />
      </CardContent>
    </Card>
  );
}

// Table row skeleton
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-4">
          <Skeleton className={cn(
            'h-4',
            i === 0 ? 'w-32' : i === columns - 1 ? 'w-8' : 'w-20'
          )} />
        </td>
      ))}
    </tr>
  );
}

// Full table skeleton with header
export function TableSkeleton({ 
  rows = 5, 
  columns = 5,
  className 
}: { 
  rows?: number; 
  columns?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-0">
        <div className="overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-4 p-4 border-b border-border bg-muted/30">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className={cn(
                'h-4',
                i === 0 ? 'w-24' : i === columns - 1 ? 'w-16' : 'w-20',
                i === 0 ? '' : 'flex-shrink-0'
              )} />
            ))}
          </div>
          {/* Rows */}
          <div className="divide-y divide-border">
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-4 p-4">
                {Array.from({ length: columns }).map((_, colIdx) => (
                  <Skeleton key={colIdx} className={cn(
                    'h-4',
                    colIdx === 0 ? 'w-32' : colIdx === columns - 1 ? 'w-8' : 'w-20',
                    colIdx === 0 ? '' : 'flex-shrink-0'
                  )} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Page header skeleton
export function PageHeaderSkeleton({ hasAction = true }: { hasAction?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {hasAction && <Skeleton className="h-9 w-28" />}
    </div>
  );
}

// Filter bar skeleton
export function FilterBarSkeleton({ filters = 3 }: { filters?: number }) {
  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Skeleton className="h-10 w-full" />
          </div>
          {Array.from({ length: filters - 1 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full sm:w-40" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Dashboard skeleton - full page layout
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={6} className="mb-8" />
      <ChartSkeleton height="h-64" className="mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <ChartSkeleton height="h-48" />
        <ChartSkeleton height="h-48" />
        <ChartSkeleton height="h-48" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-20" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// List page skeleton (Drivers, Vehicles, etc.)
export function ListPageSkeleton({ 
  columns = 6,
  rows = 8 
}: { 
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeaderSkeleton />
      <FilterBarSkeleton filters={3} />
      <TableSkeleton columns={columns} rows={rows} />
    </div>
  );
}

// Detail page skeleton with sidebar
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <ChartSkeleton height="h-48" />
        </div>
        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Skeleton className="h-20 w-20 rounded-full" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16 rounded-full" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
