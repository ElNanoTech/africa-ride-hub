import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Lock, AlertTriangle } from 'lucide-react';
import { useCloseAccidentCase } from '@/hooks/useSinistres';

export function CloseCaseModal({
  accidentId,
  resolvedStatus,
}: {
  accidentId: string;
  resolvedStatus: 'RESOLVED_AT_FAULT' | 'RESOLVED_NOT_AT_FAULT';
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const close = useCloseAccidentCase();

  const submit = async () => {
    if (!summary.trim()) return;
    await close.mutateAsync({ accidentId, resolutionSummary: summary.trim() });
    setOpen(false);
    setSummary('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Lock className="h-4 w-4 mr-2" /> Clôturer le dossier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clôturer définitivement le dossier</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded bg-warning/10 text-xs">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <span>
              Cette action est <strong>irréversible</strong>. Le dossier passera au statut "Clôturé" et ne pourra plus être modifié.
              Statut actuel : <strong>{resolvedStatus === 'RESOLVED_AT_FAULT' ? 'Responsable' : 'Non responsable'}</strong>.
            </span>
          </div>
          <div className="space-y-1">
            <Label>Résumé de résolution *</Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Ex: Indemnisation versée, dossier transmis à l'assureur, score ajusté…"
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={!summary.trim() || close.isPending}>Confirmer la clôture</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
