import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const ACTION_LABEL: Record<string, string> = {
  driver_created: 'Conducteur créé',
  driver_suspended: 'Conducteur suspendu',
  driver_reactivated: 'Conducteur réactivé',
  note_added: 'Note ajoutée',
  access_code_generated: 'Code d\'accès généré',
  access_revoked: 'Accès révoqué',
  document_uploaded: 'Document téléversé',
  document_approved: 'Document approuvé',
  document_rejected: 'Document rejeté',
  kyc_approved: 'KYC approuvé',
  kyc_rejected: 'KYC rejeté',
};

const ACTOR_TONE: Record<string, string> = {
  admin: 'bg-primary/10 text-primary',
  platform_owner: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  driver: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  system: 'bg-muted text-muted-foreground',
};

export function DriverAuditPanel({ driverId }: { driverId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-audit', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_audit')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal d'audit</CardTitle>
        <CardDescription>Historique des actions effectuées sur le conducteur</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Erreur de chargement</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucune action enregistrée</div>
        ) : (
          <div className="space-y-2">
            {data.map((row) => {
              const tone = ACTOR_TONE[row.actor_type] ?? ACTOR_TONE.system;
              return (
                <div key={row.id} className="flex items-start gap-3 border-l-2 border-border pl-3 py-2 hover:bg-muted/30 rounded-sm">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-medium flex-shrink-0 ${tone}`}>
                    {row.actor_type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {ACTION_LABEL[row.action] ?? row.action}
                    </div>
                    {row.metadata && Object.keys(row.metadata as object).length > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {JSON.stringify(row.metadata)}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {format(parseISO(row.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}