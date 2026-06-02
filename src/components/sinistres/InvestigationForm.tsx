import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccidentInvestigation, useUpsertInvestigation, AccidentInvestigation } from '@/hooks/useSinistres';
import { Save } from 'lucide-react';

const COLLISION_TYPES = ['Frontale', 'Arrière', 'Latérale', 'Sortie de route', 'Renversement', 'Piéton', 'Animal', 'Stationnement', 'Autre'];
const WEATHER = ['Ensoleillé', 'Pluie', 'Brouillard', 'Nuit', 'Crépuscule', 'Vent fort', 'Autre'];
const ROAD = ['Sec', 'Mouillé', 'Verglacé', 'En travaux', 'Mauvais état', 'Bon état', 'Autre'];
const CATEGORIES = ['Circulation', 'Stationnement', 'Vandalisme', 'Vol', 'Mécanique', 'Autre'];

export function InvestigationForm({
  accidentId,
  customerId,
  disabled,
}: {
  accidentId: string;
  customerId: string | null;
  disabled?: boolean;
}) {
  const { data } = useAccidentInvestigation(accidentId);
  const upsert = useUpsertInvestigation();
  const [form, setForm] = useState<AccidentInvestigation>({ accident_id: accidentId });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const update = <K extends keyof AccidentInvestigation>(k: K, v: AccidentInvestigation[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => upsert.mutate({ ...form, accident_id: accidentId, customer_id: customerId });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Catégorie de l'incident">
            <Select value={form.incident_category ?? ''} onValueChange={(v) => update('incident_category', v)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Type de collision">
            <Select value={form.collision_type ?? ''} onValueChange={(v) => update('collision_type', v)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>{COLLISION_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Météo">
            <Select value={form.weather_conditions ?? ''} onValueChange={(v) => update('weather_conditions', v)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>{WEATHER.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="État de la route">
            <Select value={form.road_conditions ?? ''} onValueChange={(v) => update('road_conditions', v)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>{ROAD.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Cause racine">
          <Textarea
            value={form.root_cause ?? ''}
            onChange={(e) => update('root_cause', e.target.value)}
            placeholder="Ex: vitesse excessive, distraction, défaut mécanique…"
            rows={2}
            disabled={disabled}
          />
        </Field>

        <Field label="Action corrective">
          <Textarea
            value={form.corrective_action ?? ''}
            onChange={(e) => update('corrective_action', e.target.value)}
            placeholder="Formation, suspension temporaire, avertissement…"
            rows={2}
            disabled={disabled}
          />
        </Field>

        <Field label="Constatations internes">
          <Textarea
            value={form.internal_findings ?? ''}
            onChange={(e) => update('internal_findings', e.target.value)}
            placeholder="Notes d'enquête, témoignages, hypothèses…"
            rows={3}
            disabled={disabled}
          />
        </Field>

        <div className="flex justify-end">
          <Button onClick={save} disabled={disabled || upsert.isPending}>
            <Save className="h-4 w-4 mr-2" /> Sauvegarder l'enquête
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
