import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export type StatusPillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusPillProps {
  label: string;
  tone?: StatusPillTone;
  icon?: LucideIcon;
  pulse?: boolean;
  className?: string;
}

const tones: Record<StatusPillTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  warning: 'bg-amber-500/15 text-amber-200 ring-amber-400/30',
  danger:  'bg-red-500/15 text-red-300 ring-red-400/30',
  info:    'bg-sky-500/15 text-sky-200 ring-sky-400/30',
  neutral: 'bg-white/10 text-white/80 ring-white/15',
};

/** Small ring-bordered status pill (e.g. "Uffizio GPS Connecté"). */
export function StatusPill({ label, tone = 'neutral', icon: Icon, pulse, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
        tones[tone],
        className,
      )}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full bg-current', pulse && 'animate-pulse')} />
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}