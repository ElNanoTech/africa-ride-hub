import { Badge } from '@/components/ui/badge';
import { AccidentStatus, STATUS_LABELS_FR, STATUS_TONE } from '@/lib/sinistres';
import { cn } from '@/lib/utils';

const TONE_CLS: Record<string, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary border-primary/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  success: 'bg-success/10 text-success border-success/20',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function CaseStatusBadge({ status, className }: { status: AccidentStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', TONE_CLS[STATUS_TONE[status]], className)}>
      {STATUS_LABELS_FR[status]}
    </Badge>
  );
}
