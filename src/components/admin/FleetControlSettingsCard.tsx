import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
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
}> = [
  { field: 'cycle_days',                  key: 'fleet_control.cycle_days',                  label: 'Période de contrôle (jours)',         help: 'Délai entre deux contrôles consécutifs', kind: 'int', min: 1 },
  { field: 'late_threshold_days',         key: 'fleet_control.late_threshold_days',         label: 'Seuil de retard avant escalade',      help: 'Jours de retard avant immobilisation auto', kind: 'int', min: 0 },
  { field: 'relance_threshold',           key: 'fleet_control.relance_threshold',           label: 'Nombre de relances avant escalade',   help: 'Relances envoyées avant immobilisation auto', kind: 'int', min: 0 },
  { field: 'parking_check_interval_min',  key: 'fleet_control.parking_check_interval_min',  label: 'Vérification stationnement (min)',    help: 'Fréquence de la vérification GPS', kind: 'int', min: 5 },
  { field: 'relance_cooldown_hours',      key: 'fleet_control.relance_cooldown_hours',      label: 'Délai minimum entre deux relances',   help: 'Heures avant qu\'une nouvelle relance soit autorisée', kind: 'int', min: 1 },
  { field: 'auto_immobilisation_enabled', key: 'fleet_control.auto_immobilisation_enabled', label: 'Immobilisation automatique',          help: 'Coupure du véhicule activée automatiquement quand les seuils sont dépassés', kind: 'bool' },
  { field: 'uffizio_immobilization_dry_run', key: 'fleet_control.uffizio_immobilization_dry_run', label: 'Mode test Uffizio (aucune coupure réelle)', help: 'Quand activé, le système contacte Uffizio et vérifie le véhicule mais NE coupe PAS le moteur. Désactiver pour transmettre la commande SET_OUT réelle.', kind: 'bool' },
  { field: 'require_all_photos',          key: 'fleet_control.require_all_photos',          label: 'Toutes les photos obligatoires',      help: 'Le chauffeur doit fournir les 7 photos', kind: 'bool' },
  { field: 'require_documents',           key: 'fleet_control.require_documents',           label: 'Documents obligatoires',              help: 'Le chauffeur doit fournir les 4 documents', kind: 'bool' },
];

export function FleetControlSettingsCard() {
  const [values, setValues] = useState<FleetControlSettings>(DEFAULT_FLEET_CONTROL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('fleet_control_settings');
      if (data) {
        setValues({
          cycle_days:                  Number(data.cycle_days ?? 14),
          late_threshold_days:         Number(data.late_threshold_days ?? 3),
          relance_threshold:           Number(data.relance_threshold ?? 2),
          auto_immobilisation_enabled: Boolean(data.auto_immobilisation_enabled ?? false),
          parking_check_interval_min:  Number(data.parking_check_interval_min ?? 15),
          relance_cooldown_hours:      Number(data.relance_cooldown_hours ?? 24),
          require_all_photos:          Boolean(data.require_all_photos ?? true),
          require_documents:           Boolean(data.require_documents ?? true),
          // Default TRUE so the system never cuts an engine until explicitly opted in.
          uffizio_immobilization_dry_run: data.uffizio_immobilization_dry_run === false ? false : true,
        });
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const rows = KEYS.map((k) => ({
        setting_key: k.key,
        setting_value: (values[k.field] as any) ?? null,
      }));
      const { error } = await supabase
        .from('platform_settings')
        .upsert(rows, { onConflict: 'setting_key' });
      if (error) throw error;
      toast.success('Réglages enregistrés', {
        description: 'Les changements s\'appliquent aux prochains contrôles.',
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur');
    } finally {
      setSaving(false);
    }
  };

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