import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export type KpiVariant = 'green' | 'orange' | 'blue' | 'yellow' | 'slate' | 'purple';

interface KpiTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  variant?: KpiVariant;
  hint?: string;
  className?: string;
}

const variantClasses: Record<KpiVariant, { bg: string; chip: string; text: string }> = {
  green:  { bg: 'bg-[hsl(var(--kpi-green))]',  chip: 'bg-white/70', text: 'text-[hsl(var(--kpi-green-foreground))]' },
  orange: { bg: 'bg-[hsl(var(--kpi-orange))]', chip: 'bg-white/70', text: 'text-[hsl(var(--kpi-orange-foreground))]' },
  blue:   { bg: 'bg-[hsl(var(--kpi-blue))]',   chip: 'bg-white/70', text: 'text-[hsl(var(--kpi-blue-foreground))]' },
  yellow: { bg: 'bg-[hsl(var(--kpi-yellow))]', chip: 'bg-white/70', text: 'text-[hsl(var(--kpi-yellow-foreground))]' },
  slate:  { bg: 'bg-[hsl(var(--kpi-slate))]',  chip: 'bg-white/70', text: 'text-[hsl(var(--kpi-slate-foreground))]' },
  purple: { bg: 'bg-[hsl(var(--kpi-purple))]', chip: 'bg-white/70', text: 'text-[hsl(var(--kpi-purple-foreground))]' },
};

/** Pastel-tinted KPI tile matching the KIRA reference. */
export function KpiTile({ label, value, icon: Icon, variant = 'slate', hint, className }: KpiTileProps) {
  const v = variantClasses[variant];
  return (
    <div className={cn('rounded-2xl p-4 sm:p-5 transition-shadow hover:shadow-md', v.bg, className)}>
      {Icon && (
        <div className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full mb-3', v.chip)}>
          <Icon className={cn('h-4 w-4', v.text)} />
        </div>
      )}
      <p className={cn('text-3xl font-bold leading-none', v.text)}>{value}</p>
      <p className={cn('mt-2 text-[11px] font-semibold uppercase tracking-wide', v.text, 'opacity-80')}>
        {label}
      </p>
      {hint && <p className={cn('mt-1 text-xs', v.text, 'opacity-70')}>{hint}</p>}
    </div>
  );
}