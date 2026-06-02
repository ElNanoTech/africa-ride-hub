import { useState } from 'react';
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface BulkActionsBarProps {
  selectedCount: number;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
  isLoading?: boolean;
  entityName?: string;
}

export function BulkActionsBar({
  selectedCount,
  onApprove,
  onReject,
  onClear,
  isLoading = false,
  entityName = 'éléments',
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-card border-b p-4 flex items-center justify-between gap-4 animate-in slide-in-from-top-2">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="text-sm">
          {selectedCount} {entityName} sélectionné{selectedCount > 1 ? 's' : ''}
        </Badge>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Désélectionner
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          disabled={isLoading}
          className="text-destructive hover:text-destructive"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <XCircle className="h-4 w-4 mr-2" />
          )}
          Rejeter tout
        </Button>
        <Button
          size="sm"
          onClick={onApprove}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-2" />
          )}
          Approuver tout
        </Button>
      </div>
    </div>
  );
}

interface BulkConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  action: 'approve' | 'reject';
  count: number;
  entityName?: string;
  isLoading?: boolean;
  requireReason?: boolean;
}

export function BulkConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  action,
  count,
  entityName = 'éléments',
  isLoading = false,
  requireReason = false,
}: BulkConfirmDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (requireReason && action === 'reject' && !reason.trim()) {
      return;
    }
    onConfirm(reason);
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === 'approve' ? (
              <CheckCircle className="h-5 w-5 text-primary" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            {action === 'approve' ? 'Confirmer l\'approbation' : 'Confirmer le rejet'}
          </DialogTitle>
          <DialogDescription>
            Vous êtes sur le point de {action === 'approve' ? 'approuver' : 'rejeter'}{' '}
            <strong>{count}</strong> {entityName}.
            {action === 'reject' && ' Cette action est irréversible.'}
          </DialogDescription>
        </DialogHeader>

        {action === 'reject' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Motif du rejet {requireReason && <span className="text-destructive">*</span>}
            </label>
            <Textarea
              placeholder="Entrez le motif du rejet..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Annuler
          </Button>
          <Button
            variant={action === 'approve' ? 'default' : 'destructive'}
            onClick={handleConfirm}
            disabled={isLoading || (requireReason && action === 'reject' && !reason.trim())}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : action === 'approve' ? (
              <CheckCircle className="h-4 w-4 mr-2" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            {action === 'approve' ? 'Approuver' : 'Rejeter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
