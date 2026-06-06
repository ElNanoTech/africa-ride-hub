import { useQuery } from '@tanstack/react-query';
import { DriverLayout } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { AlertTriangle, Banknote, MapPin, Calendar, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { useMemo } from 'react';

type ViolationStatus = 'pending_payment' | 'paid' | 'contested' | 'cancelled' | 'liquidated';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'À payer',
  paid: 'Payé',
  liquidated: 'Liquidé',
  contested: 'En recours',
  cancelled: 'Annulé',
};

const STATUS_TONE: Record<string, string> = {
  pending_payment: 'bg-warning/15 text-warning-foreground border-warning/30',
  paid: 'bg-success/15 text-success border-success/30',
  liquidated: 'bg-success/15 text-success border-success/30',
  contested: 'bg-info/15 text-info border-info/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

export default function DriverContraventions() {
  const { data: violations = [], isLoading } = useQuery({
    queryKey: ['driver-traffic-violations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traffic_violations')
        .select('*, vehicles:vehicles!traffic_violations_vehicle_id_fkey ( license_plate, model_name )')
        .order('violation_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const pending = useMemo(
    () => violations.filter((v) => v.status === 'pending_payment'),
    [violations],
  );
  const resolved = useMemo(
    () => violations.filter((v) => v.status !== 'pending_payment'),
    [violations],
  );
  const totalDue = useMemo(
    () => pending.reduce((sum, v) => sum + (v.amount || 0), 0),
    [pending],
  );

  const renderItem = (v: any) => (
    <Card key={v.id} className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">{v.violation_type}</div>
            {v.pv_number && (
              <div className="text-xs text-muted-foreground font-mono mt-0.5">N° {v.pv_number}</div>
            )}
          </div>
          <Badge variant="outline" className={STATUS_TONE[v.status] ?? ''}>
            {STATUS_LABEL[v.status] ?? v.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDateShort(v.violation_date)}</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-foreground justify-end">
            <Banknote className="h-3.5 w-3.5" />
            <span>{formatCurrency(v.amount)}</span>
          </div>
          {v.location && (
            <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{v.location}</span>
            </div>
          )}
          {v.vehicles?.license_plate && (
            <div className="col-span-2 text-muted-foreground font-mono">
              {v.vehicles.license_plate}
              {v.vehicles.model_name ? ` · ${v.vehicles.model_name}` : ''}
            </div>
          )}
        </div>

        {v.pdf_url && (
          <a
            href={v.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary font-medium"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Voir le PV
          </a>
        )}
      </CardContent>
    </Card>
  );

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: 'Contraventions' }]} />
      <div className="px-4 pt-2 pb-24 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Contraventions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vos amendes et contraventions enregistrées.
          </p>
        </div>

        {pending.length > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">À régler</div>
                <div className="text-lg font-bold">{formatCurrency(totalDue)}</div>
              </div>
              <Badge variant="outline" className="border-warning/40 text-warning-foreground bg-warning/10">
                {pending.length}
              </Badge>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <LoadingState />
        ) : violations.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6 text-muted-foreground" />}
            title="Aucune contravention"
            description="Bonne nouvelle, vous n'avez aucune amende enregistrée."
          />
        ) : (
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending">À payer ({pending.length})</TabsTrigger>
              <TabsTrigger value="resolved">Historique ({resolved.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="space-y-2 mt-4">
              {pending.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-6 w-6 text-muted-foreground" />}
                  title="Rien à payer"
                  description="Aucune amende en attente."
                />
              ) : (
                pending.map(renderItem)
              )}
            </TabsContent>
            <TabsContent value="resolved" className="space-y-2 mt-4">
              {resolved.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-6 w-6 text-muted-foreground" />}
                  title="Pas d'historique"
                  description="Aucune contravention résolue pour l'instant."
                />
              ) : (
                resolved.map(renderItem)
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DriverLayout>
  );
}