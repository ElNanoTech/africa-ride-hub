import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, ChevronRight, Clock3, Inbox, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export type DriverCardTone = 'good' | 'warning' | 'danger' | 'info' | 'neutral';

export interface DriverStatusItem {
  key: string;
  label: string;
  value: string;
  tone: DriverCardTone;
  icon: LucideIcon;
  to?: string;
  detail?: string;
}

export interface DriverBriefingItem {
  key: string;
  text: string;
  tone: DriverCardTone;
  icon?: LucideIcon;
  to?: string;
  value?: string;
}

export interface DriverTimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  tone: DriverCardTone;
  icon: LucideIcon;
  to?: string;
  amount?: string;
}

const toneClasses: Record<DriverCardTone, {
  icon: string;
  dot: string;
  badge: string;
  row: string;
}> = {
  good: {
    icon: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    row: 'border-emerald-500/15',
  },
  warning: {
    icon: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    badge: 'border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-300',
    row: 'border-amber-500/20',
  },
  danger: {
    icon: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
    badge: 'border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300',
    row: 'border-rose-500/20',
  },
  info: {
    icon: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    badge: 'border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300',
    row: 'border-sky-500/15',
  },
  neutral: {
    icon: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
    badge: 'border-border bg-muted/60 text-muted-foreground',
    row: 'border-border',
  },
};

function MaybeLink({ to, children, className }: { to?: string; children: React.ReactNode; className?: string }) {
  if (!to) return <div className={className}>{children}</div>;
  return <Link to={to} className={className}>{children}</Link>;
}

export function StatusCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
  to,
}: {
  title: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: DriverCardTone;
  to?: string;
}) {
  return (
    <MaybeLink to={to} className="block">
      <Card className={cn('border shadow-sm transition-colors', to && 'active:bg-muted/60')}>
        <CardContent className="flex items-center gap-3 p-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneClasses[tone].icon)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{title}</p>
            <p className="truncate text-sm font-semibold">{value}</p>
            {detail && <p className="truncate text-[11px] text-muted-foreground">{detail}</p>}
          </div>
          {to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </CardContent>
      </Card>
    </MaybeLink>
  );
}

export function ActionCard({
  title,
  description,
  icon: Icon,
  to,
  tone = 'info',
  label,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  to: string;
  tone?: DriverCardTone;
  label?: string;
}) {
  return (
    <Link to={to}>
      <Card className="border shadow-sm active:bg-muted/60">
        <CardContent className="flex items-center gap-3 p-4">
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', toneClasses[tone].icon)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
          </div>
          {label ? (
            <Badge variant="outline" className={cn('shrink-0', toneClasses[tone].badge)}>{label}</Badge>
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function MoneyCard({
  title,
  amount,
  detail,
  icon: Icon,
  to,
}: {
  title: string;
  amount: string;
  detail?: string;
  icon: LucideIcon;
  to?: string;
}) {
  return <StatusCard title={title} value={amount} detail={detail} icon={Icon} tone="good" to={to} />;
}

export function ProgressCard({
  title,
  value,
  helper,
  progress,
  icon: Icon = TrendingUp,
  to,
}: {
  title: string;
  value: string;
  helper: string;
  progress: number;
  icon?: LucideIcon;
  to?: string;
}) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <MaybeLink to={to} className="block">
      <Card className={cn('border shadow-sm', to && 'active:bg-muted/60')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{helper}</p>
              </div>
            </div>
            <p className="shrink-0 text-sm font-bold">{value}</p>
          </div>
          <Progress value={pct} className="mt-3 h-2" />
        </CardContent>
      </Card>
    </MaybeLink>
  );
}

export function HealthCard({ items }: { items: DriverStatusItem[] }) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Mon statut</p>
            <p className="text-xs text-muted-foreground">Tout ce qui peut bloquer votre journée</p>
          </div>
          <Badge variant="outline" className="bg-muted/60">5 points</Badge>
        </div>
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <MaybeLink
                key={item.key}
                to={item.to}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                  toneClasses[item.tone].row,
                  item.to && 'active:bg-muted/60',
                )}
              >
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', toneClasses[item.tone].dot)} />
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                <span className="shrink-0 text-sm font-semibold">{item.value}</span>
                {item.to && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </MaybeLink>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function DailyBriefingCard({ items, voiceAction }: { items: DriverBriefingItem[]; voiceAction?: React.ReactNode }) {
  return (
    <Card className="border-0 bg-foreground text-background shadow-lg">
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-background/65">Aujourd'hui</p>
            <h2 className="text-xl font-bold">Votre briefing</h2>
          </div>
          {voiceAction}
        </div>
        <div className="space-y-2.5">
          {items.map((item) => {
            const Icon = item.icon ?? (item.tone === 'good' ? CheckCircle2 : item.tone === 'warning' ? Clock3 : Inbox);
            const row = (
              <div className="flex items-start gap-2.5 rounded-xl bg-background/8 px-3 py-2.5">
                <Icon className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  item.tone === 'good' && 'text-emerald-300',
                  item.tone === 'warning' && 'text-amber-300',
                  item.tone === 'danger' && 'text-rose-300',
                  item.tone === 'info' && 'text-sky-300',
                  item.tone === 'neutral' && 'text-background/60',
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{item.text}</p>
                  {item.value && <p className="mt-0.5 text-xs text-background/65">{item.value}</p>}
                </div>
                {item.to && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-background/55" />}
              </div>
            );
            return item.to ? <Link key={item.key} to={item.to}>{row}</Link> : <div key={item.key}>{row}</div>;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function TimelineCard({
  title = 'Historique',
  items,
  to,
  limit,
}: {
  title?: string;
  items: DriverTimelineItem[];
  to?: string;
  limit?: number;
}) {
  const visible = limit ? items.slice(0, limit) : items;
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{title}</p>
          {to && (
            <Link to={to} className="text-xs font-semibold text-primary">
              Voir tout
            </Link>
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Rien à signaler"
            description="Vos paiements, contrôles, messages et score apparaîtront ici."
          />
        ) : (
          <div className="space-y-3">
            {visible.map((item, index) => {
              const Icon = item.icon;
              const content = (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-full', toneClasses[item.tone].icon)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {index < visible.length - 1 && <div className="mt-2 h-7 w-px bg-border" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.title}</p>
                        {item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                      </div>
                      {item.amount && <span className="shrink-0 text-xs font-bold">{item.amount}</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.timestamp}</p>
                  </div>
                </div>
              );
              return item.to ? <Link key={item.id} to={item.to}>{content}</Link> : <div key={item.id}>{content}</div>;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/25 p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-[240px] text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
