import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AccidentSeverity, SEVERITY_LABELS_FR } from '@/lib/sinistres';

const SEVERITY_CLASSES: Record<AccidentSeverity, string> = {
  UNKNOWN: 'bg-muted/50 text-muted-foreground border-dashed border-muted-foreground/40 italic',
  MINOR: 'bg-muted text-muted-foreground border-border',
  MODERATE: 'bg-warning/15 text-warning border-warning/30',
  SEVERE: 'bg-destructive/15 text-destructive border-destructive/30',
};

export function SeverityBadge({ severity, className }: { severity: AccidentSeverity; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', SEVERITY_CLASSES[severity], className)}>
      {SEVERITY_LABELS_FR[severity]}
    </Badge>
  );
}
