import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';

interface SendDriverMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  customerId: string | null;
  defaultTitle?: string;
  defaultMessage?: string;
}

/**
 * CH-P5 "Envoyer message" — inserts a `notifications` row for the driver
 * (in-app inbox, same pattern as send-broadcast) then best-effort invokes
 * `send-push-notification` ({ driverId, title, body }). The in-app insert is
 * the source of truth; push failure never blocks.
 */
export function SendDriverMessageDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
  customerId,
  defaultTitle = '',
  defaultMessage = '',
}: SendDriverMessageDialogProps) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState(defaultMessage);

  // Re-seed the prefill each time the dialog opens (recommendations pass
  // contextual defaults; a stale draft from a previous open must not leak).
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setMessage(defaultMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const m = message.trim();
      if (!t || !m) throw new Error('Titre et message requis');
      const { error } = await supabase.from('notifications').insert({
        driver_id: driverId,
        customer_id: customerId,
        title: t,
        message: m,
        notification_type: 'admin_message',
        channel: 'in_app',
        send_status: 'sent',
      });
      if (error) throw error;
      // Push is best-effort: the in-app notification is already persisted.
      // skipInApp: the function's backup in-app insert would duplicate the
      // properly-typed row inserted above.
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: { driverId, title: t, body: m, skipInApp: true },
        });
      } catch {
        /* push optional — in-app delivery already done */
      }
      // Trace in the driver audit timeline (same pattern as note_added).
      // Best-effort: the message itself is already delivered.
      try {
        await supabase.rpc('driver_log', {
          p_driver: driverId,
          p_action: 'message_sent',
          p_metadata: { title: t } as never,
        });
      } catch {
        /* audit trace optional */
      }
    },
    onSuccess: () => {
      toast.success('Message envoyé', { description: `${driverName} le verra dans ses notifications.` });
      qc.invalidateQueries({ queryKey: ['driver-audit', driverId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error('Envoi impossible', { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer un message à {driverName}</DialogTitle>
          <DialogDescription>
            Le message apparaît dans les notifications du chauffeur (in-app + push si disponible).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="msg-title">Titre</Label>
            <Input
              id="msg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Rappel de paiement"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msg-body">Message</Label>
            <Textarea
              id="msg-body"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Votre message au chauffeur…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Annuler
          </Button>
          <Button onClick={() => send.mutate()} disabled={!title.trim() || !message.trim() || send.isPending}>
            {send.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
