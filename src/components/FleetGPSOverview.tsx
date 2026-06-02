import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Car, Activity, Clock, AlertTriangle, TrendingUp, 
  Navigation, Fuel, Zap, Signal
} from 'lucide-react';
import type { UffizioVehicle } from '@/hooks/useUffizioLiveData';

interface FleetGPSOverviewProps {
  vehicles: UffizioVehicle[];
  loading: boolean;
}

export function FleetGPSOverview({ vehicles, loading }: FleetGPSOverviewProps) {
  const validVehicles = vehicles.filter(v => v.lat !== 0 && v.lng !== 0);
  const moving = vehicles.filter(v => v.status === 'moving');
  const idle = vehicles.filter(v => v.status === 'idle');
  const offline = vehicles.filter(v => v.status === 'offline');

  const avgSpeed = moving.length > 0
    ? Math.round(moving.reduce((acc, v) => acc + v.speed, 0) / moving.length)
    : 0;

  const maxSpeed = vehicles.length > 0
    ? Math.round(Math.max(...vehicles.map(v => v.speed)))
    : 0;

  const withIgnitionOn = vehicles.filter(v => 
    v.ignition === '1' || v.ignition === 'ON' || v.ignition === 'on'
  ).length;

  const utilizationRate = vehicles.length > 0
    ? Math.round(((moving.length + idle.length) / vehicles.length) * 100)
    : 0;

  const stats = [
    {
      label: 'Véhicules connectés',
      value: vehicles.length,
      icon: Signal,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'En mouvement',
      value: moving.length,
      icon: Activity,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      suffix: `/ ${vehicles.length}`,
    },
    {
      label: 'À l\'arrêt (moteur)',
      value: idle.length,
      icon: Clock,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Hors ligne',
      value: offline.length,
      icon: AlertTriangle,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Vitesse moy.',
      value: `${avgSpeed}`,
      icon: TrendingUp,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      suffix: 'km/h',
    },
    {
      label: 'Vitesse max',
      value: `${maxSpeed}`,
      icon: Navigation,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      suffix: 'km/h',
    },
    {
      label: 'Contact allumé',
      value: withIgnitionOn,
      icon: Zap,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      label: 'Taux d\'utilisation',
      value: `${utilizationRate}`,
      icon: Car,
      color: 'text-teal-500',
      bg: 'bg-teal-500/10',
      suffix: '%',
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 mb-6">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-xl font-bold">
                {stat.value}
                {stat.suffix && <span className="text-xs font-normal text-muted-foreground ml-1">{stat.suffix}</span>}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
