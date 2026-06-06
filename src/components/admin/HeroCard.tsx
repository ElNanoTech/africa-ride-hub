import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface HeroCardProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  pills?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Signature dark navy gradient hero card used at the top of admin pages.
 * Mirrors the KIRA reference: eyebrow label, big title, subtitle on the left;
 * status pills + action CTAs on the right.
 */
export function HeroCard({ eyebrow, title, subtitle, pills, actions, className }: HeroCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7 sm:py-6 mb-6',
        'text-white shadow-lg',
        className,
      )}
      style={{ background: 'var(--gradient-hero-card)' }}
    >
      <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" aria-hidden />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 text-sm sm:text-base text-white/70 max-w-2xl">{subtitle}</p>
          )}
        </div>

        {(pills || actions) && (
          <div className="flex flex-col items-start gap-3 sm:items-end shrink-0">
            {pills && <div className="flex flex-wrap gap-2 sm:justify-end">{pills}</div>}
            {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
          </div>
        )}
      </div>
    </div>
  );
}