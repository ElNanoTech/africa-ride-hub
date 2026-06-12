import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PinDigitInput } from '@/components/PinDigitInput';
import { PhoneInput, validatePhoneNumber } from '@/components/PhoneInput';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, KeyRound, AlertCircle, Camera, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/hooks/useAuditLog';
import { useAdminUser } from '@/hooks/useAdminUser';

const MOBILE_MONEY_OPERATORS = [
  { value: 'Wave', label: 'Wave' },
  { value: 'Orange Money', label: 'Orange Money' },
  { value: 'MTN Mobile Money', label: 'MTN Mobile Money' },
  { value: 'Moov Money', label: 'Moov Money' },
];

const DRIVER_STATUSES = [
  { value: 'active', label: 'Actif' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'inactive', label: 'Inactif' },
];

interface EditDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: {
    id: string;
    full_name: string;
    phone_number: string;
    email: string | null;
    profile_image_url?: string | null;
    driver_status?: string;
    active_vehicle_id?: string | null;
  };
  kycSubmission?: {
    bank_name?: string | null;
    bank_account_number?: string | null;
  } | null;
}

interface FormValues {
  fullName: string;
  email: string;
  phoneNumber: string;
  operator: string;
  mobileMoneyNumber: string;
  driverStatus: string;
  activeVehicleId: string;
  newPin: string;
}

const NO_VEHICLE = '__none__';

export function EditDriverDialog({ open, onOpenChange, driver, kycSubmission }: EditDriverDialogProps) {
  const queryClient = useQueryClient();
  const { customerId } = useAdminUser();
  const [tab, setTab] = useState<'profile' | 'pin'>('profile');
  const [submitting, setSubmitting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(driver.profile_image_url ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { control, register, handleSubmit, reset, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      fullName: '',
      email: '',
      phoneNumber: '',
      operator: '',
      mobileMoneyNumber: '',
      driverStatus: 'active',
      activeVehicleId: NO_VEHICLE,
      newPin: '',
    },
  });

  // Available vehicles for assignment
  const { data: vehicles = [] } = useQuery({
    queryKey: ['admin-vehicles-for-assignment'],
    queryFn: async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id, model_name, license_plate')
        .order('license_plate');
      return data || [];
    },
    enabled: open,
  });

  // Reset form whenever the dialog opens with the driver's current values.
  useEffect(() => {
    if (open) {
      reset({
        fullName: driver.full_name ?? '',
        email: driver.email ?? '',
        phoneNumber: driver.phone_number ?? '',
        operator: kycSubmission?.bank_name ?? '',
        mobileMoneyNumber: kycSubmission?.bank_account_number ?? '',
        driverStatus: driver.driver_status ?? 'active',
        activeVehicleId: driver.active_vehicle_id ?? NO_VEHICLE,
        newPin: '',
      });
      setPhotoUrl(driver.profile_image_url ?? null);
      setPendingFile(null);
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        setPendingPreviewUrl(null);
      }
      setTab('profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, driver, kycSubmission, reset]);

  const phoneNumber = watch('phoneNumber');
  const newPin = watch('newPin');

  const phoneChanged = phoneNumber !== driver.phone_number;
  const phoneValid = !phoneNumber || validatePhoneNumber(phoneNumber).isValid;

  const MAX_BYTES = 5 * 1024 * 1024;

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image', {
        duration: 10000,
        description: 'Formats acceptés: JPG, PNG, WEBP, GIF.',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("L'image dépasse la taille maximale", {
        duration: Infinity,
        description: `Fichier "${file.name}" : ${(file.size / 1024 / 1024).toFixed(1)} Mo. Maximum autorisé : 5 Mo. Compressez l'image avant de réessayer.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    // Show preview before upload — clear prior pending preview if any
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    const previewUrl = URL.createObjectURL(file);
    setPendingFile(file);
    setPendingPreviewUrl(previewUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancelPending = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingPreviewUrl(null);
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile) return;
    if (!customerId) {
      toast.error('Aucun client sélectionné');
      return;
    }
    setPhotoUploading(true);
    try {
      const ext = pendingFile.name.split('.').pop() || 'jpg';
      const path = `${customerId}/${driver.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('profile-photos')
        .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
      handleCancelPending();
      toast.success('Photo prête — cliquez Enregistrer pour valider');
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de l'upload";
      toast.error(msg);
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePhotoRemove = () => setPhotoUrl(null);

  const submitProfile = async (values: FormValues) => {
    if (!values.fullName.trim()) {
      toast.error('Le nom complet est requis');
      return;
    }
    if (!phoneValid) {
      toast.error('Numéro de téléphone invalide');
      return;
    }
    if (phoneChanged && !/^\d{4}$/.test(values.newPin)) {
      toast.error('Définissez un nouveau PIN — requis pour changer de téléphone.');
      setTab('pin');
      return;
    }
    if ((values.operator && !values.mobileMoneyNumber) || (!values.operator && values.mobileMoneyNumber)) {
      toast.error('Opérateur et numéro Mobile Money doivent être fournis ensemble');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { driverId: driver.id };
      if (values.fullName.trim() !== (driver.full_name ?? '')) payload.fullName = values.fullName.trim();
      if (values.email !== (driver.email ?? '')) payload.email = values.email.trim() || null;
      if (phoneChanged) payload.phoneNumber = values.phoneNumber;
      if (values.operator !== (kycSubmission?.bank_name ?? '')) payload.mobileMoneyOperator = values.operator;
      if (values.mobileMoneyNumber !== (kycSubmission?.bank_account_number ?? ''))
        payload.mobileMoneyNumber = values.mobileMoneyNumber;
      if (phoneChanged && /^\d{4}$/.test(values.newPin)) payload.newPin = values.newPin;
      if ((photoUrl ?? null) !== (driver.profile_image_url ?? null)) payload.profileImageUrl = photoUrl;
      if (values.driverStatus !== (driver.driver_status ?? 'active')) payload.driverStatus = values.driverStatus;
      const newVehicleId = values.activeVehicleId === NO_VEHICLE ? null : values.activeVehicleId;
      if (newVehicleId !== (driver.active_vehicle_id ?? null)) payload.activeVehicleId = newVehicleId;

      // Nothing to update?
      if (Object.keys(payload).length === 1) {
        toast.info('Aucune modification détectée');
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-update-driver', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      logAction({
        action: 'driver_updated',
        targetType: 'driver',
        targetId: driver.id,
        details: { fields: Object.keys(payload).filter((k) => k !== 'driverId') },
      });

      queryClient.invalidateQueries({ queryKey: ['admin-driver-detail', driver.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-driver-kyc', driver.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });

      toast.success('Conducteur mis à jour');
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la mise à jour';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const submitPinReset = async () => {
    if (!/^\d{4}$/.test(newPin)) {
      toast.error('PIN doit comporter 4 chiffres');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-driver', {
        body: { driverId: driver.id, newPin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      logAction({ action: 'driver_pin_reset', targetType: 'driver', targetId: driver.id });
      toast.success('PIN réinitialisé — communiquez-le au conducteur.');
      setValue('newPin', '');
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la réinitialisation';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const initials = (driver.full_name || '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier {driver.full_name}</DialogTitle>
          <DialogDescription>
            Mettez à jour les informations du conducteur ou réinitialisez son code PIN.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'profile' | 'pin')} className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="profile">
              <User className="h-3.5 w-3.5 mr-1.5" />
              Profil
            </TabsTrigger>
            <TabsTrigger value="pin">
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              Réinitialiser PIN
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Profile tab ---------------- */}
          <TabsContent value="profile" className="space-y-4 pt-4">
            <form onSubmit={handleSubmit(submitProfile)} className="space-y-4">
              {/* Photo */}
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={photoUrl ?? undefined} alt={driver.full_name} />
                    <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={photoUploading}
                    >
                      <Camera className="h-3.5 w-3.5 mr-1.5" />
                      {photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
                    </Button>
                    {photoUrl && !pendingFile && (
                      <Button type="button" variant="ghost" size="sm" onClick={handlePhotoRemove}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Retirer
                      </Button>
                    )}
                  </div>
                </div>

                {/* Pending file preview — shown before upload to avoid mistakes */}
                {pendingFile && pendingPreviewUrl && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={pendingPreviewUrl}
                        alt="Aperçu"
                        className="h-14 w-14 rounded-md object-cover border border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={pendingFile.name}>
                          {pendingFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(pendingFile.size / 1024 / 1024).toFixed(2)} Mo · {pendingFile.type.replace('image/', '').toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleConfirmUpload}
                        disabled={photoUploading}
                      >
                        {photoUploading ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Camera className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Téléverser
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelPending}
                        disabled={photoUploading}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Nom complet</Label>
                <Input {...register('fullName')} placeholder="Prénom NOM" />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" {...register('email')} placeholder="conducteur@example.com" />
              </div>

              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Controller
                  control={control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <PhoneInput value={field.value} onChange={field.onChange} defaultCountry="CI" />
                  )}
                />
                {phoneChanged && (
                  <Alert variant="default" className="border-warning/50 bg-warning/5">
                    <AlertCircle className="h-4 w-4 text-warning" />
                    <AlertDescription className="text-xs">
                      Changer le téléphone exige un nouveau PIN — définissez-le ci-dessous.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {phoneChanged && (
                <div className="space-y-2">
                  <Label>Nouveau PIN (requis)</Label>
                  <Controller
                    control={control}
                    name="newPin"
                    render={({ field }) => <PinDigitInput value={field.value} onChange={field.onChange} />}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Statut</Label>
                  <Controller
                    control={control}
                    name="driverStatus"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DRIVER_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Véhicule assigné</Label>
                  <Controller
                    control={control}
                    name="activeVehicleId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Aucun" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_VEHICLE}>Aucun</SelectItem>
                          {vehicles.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.license_plate} — {v.model_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Opérateur Mobile Money</Label>
                  <Controller
                    control={control}
                    name="operator"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                          {MOBILE_MONEY_OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Numéro Mobile Money</Label>
                  <Input {...register('mobileMoneyNumber')} placeholder="07 00 00 00 00" />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                  Annuler
                </Button>
                <Button type="submit" disabled={submitting || photoUploading}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* ---------------- PIN reset tab ---------------- */}
          <TabsContent value="pin" className="space-y-4 pt-4">
            <Alert>
              <KeyRound className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Définissez un nouveau code PIN à 4 chiffres. Communiquez-le au conducteur — il pourra se reconnecter immédiatement avec son téléphone et ce nouveau PIN.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Nouveau PIN</Label>
              <Controller
                control={control}
                name="newPin"
                render={({ field }) => <PinDigitInput value={field.value} onChange={field.onChange} />}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Annuler
              </Button>
              <Button type="button" onClick={submitPinReset} disabled={submitting || !/^\d{4}$/.test(newPin)}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Réinitialiser le PIN
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
