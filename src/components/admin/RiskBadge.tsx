import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RISK_LEVEL_LABEL, type DriverRiskLevel } from '@/lib/driverRisk';

// Single source of truth for risk badge colours (list + profile + overview).
// bon=emerald, moyen=amber, eleve=orange, critique=red (spec CH-L2/P4).
const LEVEL_CLASS: Record<DriverRiskLevel, string> = {
  bon: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60',
  moyen: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60',
  eleve: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200/60 dark:border-orange-800/60',
  critique: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200/60 dark:border-red-800/60',
};

interface RiskBadgeProps {
  level?: DriverRiskLevel | null;
  /** French reason strings from driver_risk / drivers_risk_summary. */
  reasons?: string[];
  loading?: boolean;
  className?: string;
}

/**
 * Computed driver risk badge (decision D-2 — risk is never stored).
 * Hover shows the mandatory reasons list. Renders "—" when the risk
 * could not be computed (no fake "Bon" default).
 */
export function RiskBadge({ level, reasons, loading, className }: RiskBadgeProps) {
  if (loading) return <Skeleton className={cn('h-5 w-16 rounded-full', className)} />;
  if (!level) return <span className={cn('text-muted-foreground text-xs', className)}>—</span>;

  const badge = (
    <Badge variant="outline" className={cn('gap-1 font-medium', LEVEL_CLASS[level], className)}>
      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
      {RISK_LEVEL_LABEL[level]}
    </Badge>
  );

  if (!reasons || reasons.length === 0) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
