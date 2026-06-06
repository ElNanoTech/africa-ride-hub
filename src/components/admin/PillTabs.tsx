import { cn } from '@/lib/utils';

export interface PillTabItem {
  value: string;
  label: string;
  count?: number;
}

interface PillTabsProps {
  items: PillTabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Rounded pill tab bar with optional counts — KIRA reference. */
export function PillTabs({ items, value, onChange, className }: PillTabsProps) {
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1.5 rounded-full bg-muted/60 p-1', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  active ? 'bg-primary/10 text-primary' : 'bg-background/80 text-muted-foreground',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}