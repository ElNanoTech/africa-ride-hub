import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Save, Plus, Trash2, User, Eye, Shield } from 'lucide-react';
import {
  AccidentRecord,
  AccidentParty,
  useUpdateAccident,
  useAccidentParties,
  useUpsertAccidentParty,
  useDeleteAccidentParty,
} from '@/hooks/useSinistres';
import { AccidentSeverity, SEVERITY_LABELS_FR, PartyType } from '@/lib/sinistres';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PARTY_META: Record<PartyType, { label: string; icon: typeof User; color: string }> = {
  OTHER_DRIVER: { label: 'Autre conducteur', icon: User, color: 'text-primary' },
  WITNESS: { label: 'Témoin', icon: Eye, color: 'text-warning' },
  POLICE: { label: 'Police', icon: Shield, color: 'text-info' },
};

/**
 * Admin-only editor for the case context that drivers no longer fill in:
 * description, severity, accident date/time, flags (police / injury / other vehicle),
 * and parties (other driver, witness, police).
 *
 * The driver only submits photos + GPS + an optional voice note. The admin
 * uses this editor during UNDER_REVIEW / INVESTIGATING to enrich the case
 * before making the determination.
 */
export function AdminCaseDetailsEditor({
  accident,
  disabled,
}: {
  accident: AccidentRecord;
  disabled?: boolean;
}) {
  const update = useUpdateAccident();
  const { data: parties = [] } = useAccidentParties(accident.id);
  const upsert = useUpsertAccidentParty();
  const del = useDeleteAccidentParty();

  const [form, setForm] = useState({
    description: '',
    severity: 'MINOR' as AccidentSeverity,
    police_involved: false,
    injury_involved: false,
    other_party_involved: false,
    accident_datetime: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    setForm({
      description: accident.description ?? '',
      severity: accident.severity,
      police_involved: accident.police_involved,
      injury_involved: accident.injury_involved,
      other_party_involved: accident.other_party_involved,
      accident_datetime: new Date(accident.accident_datetime).toISOString().slice(0, 16),
    });
  }, [accident.id]);

  const save = async () => {
    await update.mutateAsync({
      id: accident.id,
      patch: {
        description: form.description || null,
        severity: form.severity,
        police_involved: form.police_involved,
        injury_involved: form.injury_involved,
        other_party_involved: form.other_party_involved,
        accident_datetime: new Date(form.accident_datetime).toISOString(),
      },
    });
    toast.success('Détails mis à jour');
  };

  // Party dialog state
  const [partyOpen, setPartyOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Partial<AccidentParty> & { party_type: PartyType }>({
    party_type: 'OTHER_DRIVER',
  });

  const startNewParty = (t: PartyType) => {
    setEditingParty({ party_type: t });
    setPartyOpen(true);
  };

  const startEditParty = (p: AccidentParty) => {
    setEditingParty(p);
    setPartyOpen(true);
  };

  const saveParty = async () => {
    await upsert.mutateAsync({ ...editingParty, accident_id: accident.id, party_type: editingParty.party_type });
    setPartyOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <Label>Description (renseignée par l'admin)</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Notes admin sur ce qui s'est passé (à partir des photos, du message vocal et de l'enquête)…"
              disabled={disabled}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date / heure</Label>
              <Input
                type="datetime-local"
                value={form.accident_datetime}
                onChange={(e) => setForm({ ...form, accident_datetime: e.target.value })}
                disabled={disabled}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Gravité</Label>
              <div className="grid grid-cols-4 gap-1 mt-1">
                {(['UNKNOWN', 'MINOR', 'MODERATE', 'SEVERE'] as AccidentSeverity[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={disabled}
                    onClick={() => setForm({ ...form, severity: s })}
                    className={cn(
                      'h-9 rounded border text-xs font-medium transition-colors px-1',
                      form.severity === s
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground',
                      s === 'UNKNOWN' && form.severity !== s && 'border-dashed italic',
                    )}
                  >
                    {SEVERITY_LABELS_FR[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t">
            <Toggle
              label="Un autre véhicule était impliqué"
              checked={form.other_party_involved}
              onChange={(v) => setForm({ ...form, other_party_involved: v })}
              disabled={disabled}
            />
            <Toggle
              label="Y a-t-il eu des blessés"
              checked={form.injury_involved}
              onChange={(v) => setForm({ ...form, injury_involved: v })}
              disabled={disabled}
            />
            <Toggle
              label="La police est intervenue"
              checked={form.police_involved}
              onChange={(v) => setForm({ ...form, police_involved: v })}
              disabled={disabled}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={disabled || update.isPending}>
              <Save className="h-4 w-4 mr-2" /> Sauvegarder
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Parties */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Parties impliquées ({parties.length})</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PARTY_META) as PartyType[]).map((t) => {
              const M = PARTY_META[t];
              return (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  className="h-16 flex-col gap-1"
                  onClick={() => startNewParty(t)}
                  disabled={disabled}
                >
                  <Plus className="h-3 w-3" />
                  <M.icon className={`h-4 w-4 ${M.color}`} />
                  <span className="text-[10px]">{M.label}</span>
                </Button>
              );
            })}
          </div>

          {parties.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-2">
              Aucune partie. Ajoutez-en si l'enquête l'exige.
            </p>
          ) : (
            <div className="space-y-2">
              {parties.map((p) => {
                const M = PARTY_META[p.party_type];
                return (
                  <div key={p.id} className="border rounded p-2 flex items-center gap-2 text-sm">
                    <M.icon className={`h-4 w-4 shrink-0 ${M.color}`} />
                    <button
                      onClick={() => startEditParty(p)}
                      className="flex-1 text-left min-w-0"
                      disabled={disabled}
                    >
                      <div className="font-medium truncate">{p.name || M.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[p.phone, p.plate, p.insurer, p.report_number].filter(Boolean).join(' • ') || 'Aucun détail'}
                      </div>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => del.mutate({ id: p.id, accidentId: accident.id })}
                      disabled={disabled}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={partyOpen} onOpenChange={setPartyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{PARTY_META[editingParty.party_type].label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nom complet</Label>
              <Input
                value={editingParty.name ?? ''}
                onChange={(e) => setEditingParty({ ...editingParty, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input
                value={editingParty.phone ?? ''}
                onChange={(e) => setEditingParty({ ...editingParty, phone: e.target.value })}
                className="mt-1"
              />
            </div>
            {editingParty.party_type === 'OTHER_DRIVER' && (
              <>
                <div>
                  <Label>Plaque</Label>
                  <Input
                    value={editingParty.plate ?? ''}
                    onChange={(e) => setEditingParty({ ...editingParty, plate: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Assureur</Label>
                  <Input
                    value={editingParty.insurer ?? ''}
                    onChange={(e) => setEditingParty({ ...editingParty, insurer: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>N° de police d'assurance</Label>
                  <Input
                    value={editingParty.insurance_policy ?? ''}
                    onChange={(e) => setEditingParty({ ...editingParty, insurance_policy: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </>
            )}
            {editingParty.party_type === 'POLICE' && (
              <>
                <div>
                  <Label>N° du rapport</Label>
                  <Input
                    value={editingParty.report_number ?? ''}
                    onChange={(e) => setEditingParty({ ...editingParty, report_number: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Commissariat / unité</Label>
                  <Input
                    value={editingParty.officer_department ?? ''}
                    onChange={(e) => setEditingParty({ ...editingParty, officer_department: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={editingParty.notes ?? ''}
                onChange={(e) => setEditingParty({ ...editingParty, notes: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPartyOpen(false)}>Annuler</Button>
            <Button onClick={saveParty} disabled={upsert.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Toggle({
  label, checked, onChange, disabled,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
