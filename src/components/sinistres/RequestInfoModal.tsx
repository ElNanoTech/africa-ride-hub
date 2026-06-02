import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileQuestion } from 'lucide-react';
import { useRequestMoreInfo } from '@/hooks/useSinistres';
import { AccidentStatus } from '@/lib/sinistres';

const QUICK_TEMPLATES = [
  'Photos supplémentaires des dégâts',
  'Copie du rapport de police',
  'Coordonnées de l\'autre conducteur',
  'Justificatif d\'assurance',
  'Témoignages écrits',
];

export function RequestInfoModal({
  accidentId,
  currentStatus,
}: {
  accidentId: string;
  currentStatus: AccidentStatus;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRequestMoreInfo();

  const submit = async () => {
    if (!message.trim()) return;
    await request.mutateAsync({ accidentId, message: message.trim(), currentStatus });
    setOpen(false);
    setMessage('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileQuestion className="h-4 w-4 mr-2" /> Demander des infos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Demander des informations au conducteur</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Le conducteur recevra une notification et le statut passera automatiquement à "En attente de documents".
          </p>

          <div className="space-y-1">
            <Label className="text-xs">Modèles rapides</Label>
            <div className="flex flex-wrap gap-1">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMessage((m) => (m ? `${m}\n• ${t}` : `• ${t}`))}
                  className="text-xs px-2 py-1 rounded border bg-muted hover:bg-accent transition-colors"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Message au conducteur *</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Précisez les documents ou clarifications nécessaires…"
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={!message.trim() || request.isPending}>Envoyer la demande</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
