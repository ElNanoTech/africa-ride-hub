import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, FileText, ExternalLink, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAdminUser } from '@/hooks/useAdminUser';

const DOC_TYPES = [
  { value: 'permis_recto', label: 'Permis (recto)' },
  { value: 'permis_verso', label: 'Permis (verso)' },
  { value: 'cni_recto', label: 'CNI (recto)' },
  { value: 'cni_verso', label: 'CNI (verso)' },
  { value: 'photo_portrait', label: 'Photo portrait' },
  { value: 'attestation_residence', label: 'Attestation de résidence' },
  { value: 'casier_judiciaire', label: 'Casier judiciaire' },
  { value: 'certificat_medical', label: 'Certificat médical' },
  { value: 'autre', label: 'Autre' },
];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  approved: 'secondary',
  pending: 'default',
  rejected: 'destructive',
  expired: 'outline',
};

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approuvé',
  pending: 'En attente',
  rejected: 'Rejeté',
  expired: 'Expiré',
};

interface DriverDocumentsPanelProps {
  driverId: string;
  customerId: string | null;
}

export function DriverDocumentsPanel({ driverId, customerId }: DriverDocumentsPanelProps) {
  const qc = useQueryClient();
  const { customerId: scopedCustomer } = useAdminUser();
  const effectiveCustomer = customerId || scopedCustomer;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<string>('permis_recto');
  const [expiry, setExpiry] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['driver-documents', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('driver_id', driverId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: 'approved' | 'rejected'; reason?: string }) => {
      const { error } = await supabase
        .from('driver_documents')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason ?? null,
        })
        .eq('id', id);
      if (error) throw error;
      await supabase.rpc('driver_log', {
        p_driver: driverId,
        p_action: status === 'approved' ? 'document_approved' : 'document_rejected',
        p_metadata: { document_id: id } as never,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-documents', driverId] });
      qc.invalidateQueries({ queryKey: ['driver-audit', driverId] });
      toast.success('Document mis à jour');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => {
      const doc = data?.find((d) => d.id === id);
      if (doc?.file_path) {
        await supabase.storage.from('driver-documents').remove([doc.file_path]);
      }
      const { error } = await supabase.from('driver_documents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-documents', driverId] });
      toast.success('Document supprimé');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!effectiveCustomer) {
      toast.error('Aucun client actif sélectionné');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max 10 Mo)');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${effectiveCustomer}/${driverId}/${docType}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('driver-documents')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('driver_documents').insert({
        driver_id: driverId,
        customer_id: effectiveCustomer,
        document_type: docType,
        file_path: path,
        expiry_date: expiry || null,
        status: 'pending',
      });
      if (insErr) throw insErr;
      await supabase.rpc('driver_log', {
        p_driver: driverId,
        p_action: 'document_uploaded',
        p_metadata: { document_type: docType } as never,
      });
      qc.invalidateQueries({ queryKey: ['driver-documents', driverId] });
      qc.invalidateQueries({ queryKey: ['driver-audit', driverId] });
      toast.success('Document téléversé');
      setExpiry('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur téléversement';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const openDoc = async (path: string) => {
    const { data, error } = await supabase.storage
      .from('driver-documents')
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error('Impossible d\'ouvrir le document');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>Pièces justificatives complémentaires</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-[1fr,180px,auto] gap-2 items-end border rounded-lg p-3">
          <div>
            <Label className="text-xs">Type de document</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Expiration (opt.)</Label>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          <div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} accept="image/*,application/pdf" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || !effectiveCustomer}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Téléverser
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucun document</div>
        ) : (
          <div className="space-y-2">
            {data.map((d) => (
              <div key={d.id} className="border rounded-lg p-3 flex items-center gap-3 flex-wrap">
                <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">
                      {DOC_TYPES.find((t) => t.value === d.document_type)?.label ?? d.document_type}
                    </span>
                    <Badge variant={STATUS_VARIANT[d.status] ?? 'outline'}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </Badge>
                    {d.expiry_date && (
                      <Badge variant="outline" className="text-[10px]">
                        Exp. {format(parseISO(d.expiry_date), 'dd MMM yyyy', { locale: fr })}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Téléversé le {format(parseISO(d.uploaded_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </div>
                  {d.rejection_reason && (
                    <div className="text-xs text-destructive mt-1">Motif: {d.rejection_reason}</div>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openDoc(d.file_path)}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  {d.status === 'pending' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatus.mutate({ id: d.id, status: 'approved' })}
                        disabled={updateStatus.isPending}
                        title="Approuver"
                      >
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const reason = window.prompt('Motif du rejet ?');
                          if (reason && reason.trim()) {
                            updateStatus.mutate({ id: d.id, status: 'rejected', reason: reason.trim() });
                          }
                        }}
                        disabled={updateStatus.isPending}
                        title="Rejeter"
                      >
                        <XCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Supprimer ce document ?')) deleteDoc.mutate(d.id);
                    }}
                    disabled={deleteDoc.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}