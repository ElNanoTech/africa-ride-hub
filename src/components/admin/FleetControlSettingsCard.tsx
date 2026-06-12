import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import {
  useFleetControlSettings,
  FLEET_CONTROL_SETTINGS_QUERY_KEY,
} from '@/hooks/useFleetControlSettings';
import {
  DEFAULT_FLEET_CONTROL_SETTINGS,
  type FleetControlSettings,
} from '@/lib/fleetControl';

const supabase = _supabase as any;

const KEYS: Array<{
  field: keyof FleetControlSettings;
  key: string;
  label: string;
  help: string;
  kind: 'int' | 'bool';
  min?: number;
  readOnly?: boolean;
}> = [
  { field: 'cycle_days',                  key: 'fleet_control.cycle_days',                  label: 'Période de contrôle (jours)',         help: 'Délai entre deux contrôles consécutifs', kind: 'int', min: 1 },
  { field: 'late_threshold_days',         key: 'fleet_control.late_threshold_days',         label: 'Seuil de retard avant escalade',      help: 'Jours de retard avant immobilisation auto', kind: 'int', min: 0 },
  { field: 'relance_threshold',           key: 'fleet_control.relance_threshold',           label: 'Nombre de relances avant escalade',   help: 'Relances envoyées avant immobilisation auto', kind: 'int', min: 0 },
  // FC-A4: the parking-check cron runs on a fixed 15-min schedule server-side.
  // Honest UI: show the value, do not pretend it is configurable.
  { field: 'parking_check_interval_min',  key: 'fleet_control.parking_check_interval_min',  label: 'Vérification stationnement (min)',    help: 'Intervalle fixe : 15 min (planifié côté serveur)', kind: 'int', min: 5, readOnly: true },
  { field: 'relance_cooldown_hours',      key: 'fleet_control.relance_cooldown_hours',      label: 'Délai minimum entre deux relances',   help: 'Heures avant qu\'une nouvelle relance soit autorisée', kind: 'int', min: 1 },
  { field: 'auto_immobilisation_enabled', key: 'fleet_control.auto_immobilisation_enabled', label: 'Immobilisation automatique',          help: 'Coupure du véhicule activée automatiquement quand les seuils sont dépassés', kind: 'bool' },
  { field: 'uffizio_immobilization_dry_run', key: 'fleet_control.uffizio_immobilization_dry_run', label: 'Mode test Uffizio (aucune coupure réelle)', help: 'Quand activé, le système contacte Uffizio et vérifie le véhicule mais NE coupe PAS le moteur. Désactiver pour transmettre la commande SET_OUT réelle.', kind: 'bool' },
  { field: 'require_all_photos',          key: 'fleet_control.require_all_photos',          label: 'Toutes les photos obligatoires',      help: 'Le chauffeur doit fournir les 7 photos', kind: 'bool' },
  { field: 'require_documents',           key: 'fleet_control.require_documents',           label: 'Documents obligatoires',              help: 'Le chauffeur doit fournir les 4 documents', kind: 'bool' },
];

export function FleetControlSettingsCard() {
  const qc = useQueryClient();
  // Shared settings query (admin page + driver screens use the same key).
  const { data: fetched, isLoading: loading } = useFleetControlSettings();
  // Local draft: starts from the fetched values, diverges on edit.
  const [draft, setDraft] = useState<FleetControlSettings | null>(null);
  const values = draft ?? fetched ?? DEFAULT_FLEET_CONTROL_SETTINGS;
  const setValues = (updater: (v: FleetControlSettings) => FleetControlSettings) =>
    setDraft(updater(values));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = KEYS.map((k) => ({
        setting_key: k.key,
        setting_value: (values[k.field] as any) ?? null,
      }));
      const { error } = await supabase
        .from('platform_settings')
        .upsert(rows, { onConflict: 'setting_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      // Every consumer of the shared settings query sees the new values.
      qc.invalidateQueries({ queryKey: FLEET_CONTROL_SETTINGS_QUERY_KEY });
      toast.success('Réglages enregistrés', {
        description: 'Les changements s\'appliquent aux prochains contrôles.',
      });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });
  const saving = saveMutation.isPending;
  const save = () => saveMutation.mutate();

  return (
    <Card id="fleet-control">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Contrôle flotte
        </CardTitle>
        <CardDescription>
          Les changements s'appliquent aux prochains contrôles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {KEYS.filter((k) => k.kind === 'int').map((k) => (
                <div key={k.key} className="space-y-1">
                  <Label>{k.label}</Label>
                  <Input
                    type="number"
                    min={k.min}
                    value={values[k.field] as number}
                    readOnly={k.readOnly}
                    disabled={k.readOnly}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [k.field]: Math.max(k.min ?? 0, Number(e.target.value)) }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{k.help}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3">
              {KEYS.filter((k) => k.kind === 'bool').map((k) => (
                <div key={k.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{k.label}</Label>
                    <p className="text-sm text-muted-foreground">{k.help}</p>
                  </div>
                  <Switch
                    checked={values[k.field] as boolean}
                    onCheckedChange={(checked) => setValues((v) => ({ ...v, [k.field]: checked }))}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer les réglages
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}