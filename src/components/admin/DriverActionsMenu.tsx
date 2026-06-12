import { useState } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ShieldX, ShieldCheck, KeyRound, MoreVertical, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface DriverActionsMenuProps {
  driverId: string;
  driverName: string;
  driverStatus: string;
  onChanged?: () => void;
}

export function DriverActionsMenu({ driverId, driverName, driverStatus, onChanged }: DriverActionsMenuProps) {
  const qc = useQueryClient();
  const [showSuspend, setShowSuspend] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const [accessCode, setAccessCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isSuspended = driverStatus === 'suspended' || driverStatus === 'blocked';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-driver-detail', driverId] });
    qc.invalidateQueries({ queryKey: ['admin-drivers'] });
    qc.invalidateQueries({ queryKey: ['driver-audit', driverId] });
    onChanged?.();
  };

  const suspend = async () => {
    if (!reason.trim()) {
      toast.error('Motif requis');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('driver_suspend', {
      p_driver: driverId,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${driverName} suspendu`);
    setShowSuspend(false);
    setReason('');
    invalidate();
  };

  const reactivate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('driver_reactivate', { p_driver: driverId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${driverName} réactivé`);
    invalidate();
  };

  const genCode = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('driver_generate_access_code', { p_driver: driverId });
    setBusy(false);
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      toast.error(error?.message || 'Génération impossible');
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setAccessCode({ code: (row as { code: string }).code, expires_at: (row as { expires_at: string }).expires_at });
    invalidate();
  };

  const copy = () => {
    if (!accessCode) return;
    navigator.clipboard.writeText(accessCode.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <MoreVertical className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Accès &amp; sécurité</DropdownMenuLabel>
          <DropdownMenuItem onClick={genCode}>
            <KeyRound className="h-4 w-4 mr-2" />
            Générer code d'accès
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Statut du compte</DropdownMenuLabel>
          {isSuspended ? (
            <DropdownMenuItem onClick={reactivate} className="text-primary">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Réactiver
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setShowSuspend(true)} className="text-destructive">
              <ShieldX className="h-4 w-4 mr-2" />
              Suspendre
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Suspend dialog */}
      <Dialog open={showSuspend} onOpenChange={setShowSuspend}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspendre {driverName}</DialogTitle>
            <DialogDescription>
              Le conducteur ne pourra plus se connecter ni louer un véhicule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="suspend-reason">Motif de la suspension</Label>
            <Textarea
              id="suspend-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: non-paiement, comportement à risque..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuspend(false)} disabled={busy}>Annuler</Button>
            <Button variant="destructive" onClick={suspend} disabled={!reason.trim() || busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldX className="h-4 w-4 mr-2" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Access code reveal */}
      <Dialog open={!!accessCode} onOpenChange={(o) => !o && setAccessCode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Code d'accès généré</DialogTitle>
            <DialogDescription>
              Communiquez ce code à {driverName}. Il ne sera plus affiché après fermeture.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Input readOnly value={accessCode?.code ?? ''} className="font-mono text-2xl text-center tracking-widest" />
              <Button onClick={copy} variant="outline" size="icon" aria-label="Copier">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {accessCode?.expires_at && (
              <p className="text-xs text-muted-foreground">
                Expire le {new Date(accessCode.expires_at).toLocaleString('fr-FR')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setAccessCode(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}