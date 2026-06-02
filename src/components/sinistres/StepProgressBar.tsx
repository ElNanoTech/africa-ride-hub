import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface Props {
  steps: { key: string; label: string }[];
  currentIndex: number;
}

export function StepProgressBar({ steps, currentIndex }: Props) {
  return (
    <div className="w-full px-4 py-3 bg-card border-b border-border">
      <div className="flex items-center justify-between gap-1">
        {steps.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={s.key} className="flex-1 flex flex-col items-center">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                  done && 'bg-primary text-primary-foreground',
                  active && 'bg-primary/15 text-primary border-2 border-primary',
                  !done && !active && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('mt-1 text-[10px] text-center leading-tight', active ? 'text-primary font-medium' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
