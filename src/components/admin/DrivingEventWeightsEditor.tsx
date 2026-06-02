import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Gauge, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Weight {
  alert_type_id: number;
  alert_name: string;
  score_delta: number;
  active: boolean;
}

/**
 * Inline editor for Uffizio driving-event score weights.
 * Lives inside ScoringConfig so customers can tune speed/braking penalties
 * without code changes.
 */
export function DrivingEventWeightsEditor() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, Partial<Weight>>>({});

  const { data: weights, isLoading } = useQuery<Weight[]>({
    queryKey: ['driving_event_weights'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driving_event_weights')
        .select('alert_type_id, alert_name, score_delta, active')
        .order('alert_type_id');
      if (error) throw error;
      return data as Weight[];
    },
  });

  const save = useMutation({
    mutationFn: async (row: Weight & { score_delta: number; active: boolean }) => {
      const { error } = await supabase
        .from('driving_event_weights')
        .update({ score_delta: row.score_delta, active: row.active })
        .eq('alert_type_id', row.alert_type_id);
      if (error) throw error;
    },
    onSuccess: (_, row) => {
      toast.success(`${row.alert_name} mis à jour`);
      setDrafts(d => {
        const next = { ...d };
        delete next[row.alert_type_id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['driving_event_weights'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          Poids des événements de conduite
        </CardTitle>
        <CardDescription>
          Pénalités appliquées au score à chaque alerte Uffizio (excès de vitesse, freinage brusque, etc.).
          Désactivez pour ignorer un type d'alerte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {weights?.map(w => {
              const draft = drafts[w.alert_type_id] ?? {};
              const currentDelta = draft.score_delta ?? w.score_delta;
              const currentActive = draft.active ?? w.active;
              const dirty = draft.score_delta !== undefined || draft.active !== undefined;

              return (
                <div
                  key={w.alert_type_id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:items-center p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium text-sm">{w.alert_name}</p>
                    <p className="text-xs text-muted-foreground">ID Uffizio: {w.alert_type_id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Δ score</span>
                    <Input
                      type="number"
                      value={currentDelta}
                      onChange={e =>
                        setDrafts(d => ({
                          ...d,
                          [w.alert_type_id]: { ...d[w.alert_type_id], score_delta: parseInt(e.target.value) || 0 },
                        }))
                      }
                      className="w-20 text-right"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Actif</span>
                    <Switch
                      checked={currentActive}
                      onCheckedChange={v =>
                        setDrafts(d => ({
                          ...d,
                          [w.alert_type_id]: { ...d[w.alert_type_id], active: v },
                        }))
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={dirty ? 'default' : 'outline'}
                    disabled={!dirty || save.isPending}
                    onClick={() =>
                      save.mutate({
                        alert_type_id: w.alert_type_id,
                        alert_name: w.alert_name,
                        score_delta: currentDelta,
                        active: currentActive,
                      })
                    }
                  >
                    {save.isPending && save.variables?.alert_type_id === w.alert_type_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Sauver'
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
