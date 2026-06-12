import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PinDigitInput } from '@/components/PinDigitInput';
import { PhoneInput, validatePhoneNumber } from '@/components/PhoneInput';
import { toast } from 'sonner';
import { Loader2, Copy, CheckCircle2, Upload, FileCheck, Camera, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/hooks/useAuditLog';
import { useAdminUser } from '@/hooks/useAdminUser';

interface AdminCreateDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewProfile?: (driverId: string) => void;
}

interface CreatedCredentials {
  driverId: string;
  fullName: string;
  phoneNumber: string;
  pin: string;
  kycStatus: string;
}

interface CreateDriverFormValues {
  fullName: string;
  phoneNumber: string;
  pin: string;
  email: string;
  operator: string;
  mobileMoneyNumber: string;
  idProofUrl: string;
  licenseUrl: string;
  profileImageUrl: string;
}

const MOBILE_MONEY_OPERATORS = [
  { value: 'Wave', label: 'Wave' },
  { value: 'Orange Money', label: 'Orange Money' },
  { value: 'MTN Mobile Money', label: 'MTN Mobile Money' },
  { value: 'Moov Money', label: 'Moov Money' },
];

const DEFAULT_VALUES: CreateDriverFormValues = {
  fullName: '',
  phoneNumber: '',
  pin: '',
  email: '',
  operator: '',
  mobileMoneyNumber: '',
  idProofUrl: '',
  licenseUrl: '',
  profileImageUrl: '',
};

// Map structured error codes from create-managed-driver to user-friendly French messages.
const ERROR_MESSAGES: Record<string, string> = {
  missing_auth: 'Session admin expirée — reconnectez-vous',
  unauthorized: 'Session admin invalide — reconnectez-vous',
  forbidden: "Vous n'avez pas les droits administrateur requis",
  missing_full_name: 'Le nom complet est obligatoire',
  missing_phone: 'Le numéro de téléphone est obligatoire',
  invalid_pin: 'Le code PIN doit comporter exactement 4 chiffres',
  invalid_phone: 'Le numéro ivoirien doit comporter exactement 10 chiffres après +225',
  duplicate_phone: 'Ce numéro de téléphone est déjà utilisé par un autre conducteur',
  duplicate_email: 'Cet email est déjà utilisé par un autre conducteur',
  duplicate_mobile_money: 'Ce numéro Mobile Money est déjà utilisé par un autre conducteur',
  duplicate_driver: 'Un conducteur avec ces informations existe déjà',
  orphan_not_found: "Conflit d'authentification — contactez le support technique",
  auth_create_failed: "Impossible de créer le compte d'authentification",
  auth_list_failed: 'Impossible de vérifier les comptes existants — réessayez',
  driver_insert_failed: 'Échec de la création du profil conducteur',
  internal_error: 'Erreur interne du serveur — réessayez dans un instant',
};

// Map an edge function error code to a specific form field (when applicable).
const ERROR_CODE_TO_FIELD: Record<string, keyof CreateDriverFormValues> = {
  missing_full_name: 'fullName',
  missing_phone: 'phoneNumber',
  invalid_phone: 'phoneNumber',
  duplicate_phone: 'phoneNumber',
  duplicate_email: 'email',
  duplicate_mobile_money: 'mobileMoneyNumber',
  invalid_pin: 'pin',
};

// Simple email regex — keep client-side validation lenient; edge function is source of truth.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapErrorToMessage(code?: string, fallback?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback || 'Erreur lors de la création du conducteur';
}

async function parseEdgeFunctionError(error: unknown): Promise<{ error?: string; code?: string } | null> {
  try {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.text === 'function') {
      const text = await ctx.text();
      return text ? JSON.parse(text) : null;
    }
    if (ctx?.body && typeof ctx.body.text === 'function') {
      const text = await ctx.body.text();
      return text ? JSON.parse(text) : null;
    }
    if (typeof ctx === 'string') {
      return JSON.parse(ctx);
    }
  } catch { /* ignore */ }
  return null;
}

export function AdminCreateDriverDialog({ open, onOpenChange, onViewProfile }: AdminCreateDriverDialogProps) {
  const queryClient = useQueryClient();
  const { customerId } = useAdminUser();
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);
  const [uploadingId, setUploadingId] = useState(false);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const resetOnNextOpenRef = useRef(true);

  const {
    control,
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<CreateDriverFormValues>({
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
  });

  const [fullName, phoneNumber, pin, operator, idProofUrl, licenseUrl, email] = watch([
    'fullName',
    'phoneNumber',
    'pin',
    'operator',
    'idProofUrl',
    'licenseUrl',
    'email',
  ]);

  const mobileMoneyNumberValue = watch('mobileMoneyNumber');
  const phoneValid = validatePhoneNumber(phoneNumber).isValid;
  const emailValid = !email?.trim() || EMAIL_REGEX.test(email.trim());
  const mobileMoneyValid = !!operator && /^[0-9 +]{8,}$/.test(mobileMoneyNumberValue || '');
  const canSubmit = !!fullName.trim() && phoneValid && emailValid && /^\d{4}$/.test(pin) && mobileMoneyValid;

  useEffect(() => {
    if (open && resetOnNextOpenRef.current) {
      reset(DEFAULT_VALUES);
      setCreated(null);
      if (pendingPhoto) {
        URL.revokeObjectURL(pendingPhoto.previewUrl);
        setPendingPhoto(null);
      }
      resetOnNextOpenRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const handleClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const closeAndPrepareReset = () => {
    resetOnNextOpenRef.current = true;
    onOpenChange(false);
  };

  const uploadToKyc = async (file: File, prefix: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `admin-managed/${prefix}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('kyc-documents').upload(path, file, { upsert: false });
    if (error) {
      toast.error(`Erreur d'upload: ${error.message}`);
      return null;
    }
    return path;
  };

  const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(true);
    try {
      const url = await uploadToKyc(file, 'id');
      if (url) {
        setValue('idProofUrl', url, { shouldDirty: true });
        toast.success('Pièce d\'identité téléchargée');
      }
    } finally {
      setUploadingId(false);
    }
  };

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLicense(true);
    try {
      const url = await uploadToKyc(file, 'license');
      if (url) {
        setValue('licenseUrl', url, { shouldDirty: true });
        toast.success('Permis téléchargé');
      }
    } finally {
      setUploadingLicense(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image', {
        duration: 10000,
        description: 'Formats acceptés: JPG, PNG, WEBP, GIF.',
      });
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'image dépasse la taille maximale", {
        duration: Infinity,
        description: `Fichier "${file.name}" : ${(file.size / 1024 / 1024).toFixed(1)} Mo. Maximum autorisé : 5 Mo. Compressez l'image avant de réessayer.`,
      });
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto({ file, previewUrl: URL.createObjectURL(file) });
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handlePhotoCancel = () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto(null);
  };

  const handlePhotoUpload = async () => {
    if (!pendingPhoto) return;
    if (!customerId) {
      toast.error('Aucun client sélectionné');
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = pendingPhoto.file.name.split('.').pop() || 'jpg';
      const path = `${customerId}/new/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('profile-photos')
        .upload(path, pendingPhoto.file, { upsert: false, contentType: pendingPhoto.file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
      setValue('profileImageUrl', data.publicUrl, { shouldDirty: true });
      handlePhotoCancel();
      toast.success('Photo téléversée');
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de l'upload";
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoRemove = () => {
    setValue('profileImageUrl', '', { shouldDirty: true });
  };

  const applyEdgeFieldError = (code?: string, message?: string) => {
    if (!code) return false;
    const field = ERROR_CODE_TO_FIELD[code];
    if (!field) return false;
    setError(field, { type: 'server', message: message || ERROR_MESSAGES[code] });
    return true;
  };

  const submitForm = async (values: CreateDriverFormValues) => {
    clearErrors();

    // Mobile-friendly client-side validation with inline errors
    let hasError = false;
    if (!values.fullName.trim()) {
      setError('fullName', { type: 'manual', message: 'Le nom complet est obligatoire' });
      hasError = true;
    }
    if (!validatePhoneNumber(values.phoneNumber).isValid) {
      setError('phoneNumber', { type: 'manual', message: 'Numéro de téléphone invalide' });
      hasError = true;
    }
    if (!/^\d{4}$/.test(values.pin)) {
      setError('pin', { type: 'manual', message: 'Le PIN doit comporter 4 chiffres' });
      hasError = true;
    }
    if (values.email.trim() && !EMAIL_REGEX.test(values.email.trim())) {
      setError('email', { type: 'manual', message: 'Adresse email invalide' });
      hasError = true;
    }
    if (!values.operator) {
      setError('operator', { type: 'manual', message: 'Sélectionnez un opérateur' });
      hasError = true;
    }
    if (!/^[0-9 +]{8,}$/.test(values.mobileMoneyNumber || '')) {
      setError('mobileMoneyNumber', { type: 'manual', message: 'Numéro Mobile Money invalide' });
      hasError = true;
    }
    if (hasError) {
      toast.error('Veuillez corriger les champs en rouge');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-managed-driver', {
        body: {
          fullName: values.fullName.trim(),
          phoneNumber: values.phoneNumber,
          pin: values.pin,
          email: values.email.trim() || undefined,
          bankName: values.operator || undefined,
          bankAccountNumber: values.mobileMoneyNumber || undefined,
          idProofUrl: values.idProofUrl || undefined,
          licenseUrl: values.licenseUrl || undefined,
          profileImageUrl: values.profileImageUrl || undefined,
          customerId: customerId ?? undefined,
        },
      });

      // supabase.functions.invoke returns FunctionsHttpError on non-2xx; the
      // JSON body lives on error.context (a Response). Parse it so we can show
      // the specific code/message returned by the edge function.
      if (error) {
        const parsed = await parseEdgeFunctionError(error);
        const message = mapErrorToMessage(parsed?.code, parsed?.error) || error.message || 'Erreur lors de la création';
        applyEdgeFieldError(parsed?.code, message);
        toast.error(message);
        return;
      }
      if (data?.error) {
        const message = mapErrorToMessage(data.code, data.error);
        applyEdgeFieldError(data.code, message);
        toast.error(message);
        return;
      }

      logAction({ action: 'driver_created', targetType: 'driver', targetId: data.driverId, details: { managed: true } });
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
      setCreated({
        driverId: data.driverId,
        fullName: values.fullName,
        phoneNumber: values.phoneNumber,
        pin: values.pin,
        kycStatus: data.kycStatus,
      });
      toast.success('Conducteur créé avec succès', {
        description: data.recoveredOrphan
          ? "Un compte d'authentification orphelin a été récupéré."
          : undefined,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappMessage = created
    ? `Bonjour ${created.fullName},
Votre compte DAM Flotte est prêt.
📱 Téléphone: ${created.phoneNumber}
🔐 PIN: ${created.pin}
Connectez-vous sur: https://drivedam.com/driver/login`
    : '';

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      toast.success('Message copié — collez-le dans WhatsApp');
    } catch {
      toast.error('Impossible de copier');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl w-[95vw] max-h-[90vh] overflow-y-auto">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>Nouveau conducteur</DialogTitle>
              <DialogDescription>
                Champs avec <span className="text-destructive font-semibold">*</span> obligatoires. Après création vous devrez approuver le KYC puis activer le conducteur.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-4 py-2" onSubmit={handleSubmit(submitForm)}>
              <div className="space-y-1.5">
                <Label>Nom complet <span className="text-destructive">*</span></Label>
                <Input
                  {...register('fullName', { onChange: () => clearErrors('fullName') })}
                  placeholder="Jean Kouassi"
                  autoComplete="name"
                  autoCapitalize="words"
                  aria-invalid={!!errors.fullName}
                  className={errors.fullName ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {errors.fullName && (
                  <p className="text-xs text-destructive">{errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Téléphone <span className="text-destructive">*</span></Label>
                <Controller
                  control={control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <PhoneInput
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        if (errors.phoneNumber) clearErrors('phoneNumber');
                      }}
                      defaultCountry="CI"
                    />
                  )}
                />
                {errors.phoneNumber && (
                  <p className="text-xs text-destructive">{errors.phoneNumber.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Code PIN à 4 chiffres <span className="text-destructive">*</span></Label>
                <Controller
                  control={control}
                  name="pin"
                  render={({ field }) => (
                    <PinDigitInput
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        if (errors.pin) clearErrors('pin');
                      }}
                    />
                  )}
                />
                {errors.pin ? (
                  <p className="text-xs text-destructive text-center">{errors.pin.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    Le conducteur l'utilisera pour se connecter.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Opérateur Mobile Money <span className="text-destructive">*</span></Label>
                  <Controller
                    control={control}
                    name="operator"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          if (errors.operator) clearErrors('operator');
                        }}
                      >
                        <SelectTrigger className={errors.operator ? 'border-destructive' : ''}>
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
                  {errors.operator && (
                    <p className="text-xs text-destructive">{errors.operator.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Numéro Mobile Money <span className="text-destructive">*</span></Label>
                  <Input
                    {...register('mobileMoneyNumber', { onChange: () => clearErrors('mobileMoneyNumber') })}
                    placeholder="07 00 00 00 00"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    aria-invalid={!!errors.mobileMoneyNumber}
                    className={errors.mobileMoneyNumber ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {errors.mobileMoneyNumber && (
                    <p className="text-xs text-destructive">{errors.mobileMoneyNumber.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Email <span className="text-xs font-normal">(optionnel)</span></Label>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  {...register('email', { onChange: () => clearErrors('email') })}
                  placeholder="conducteur@example.com"
                  aria-invalid={!!errors.email}
                  className={errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              {/* Profile photo (optional) */}
              <div className="rounded-lg border border-dashed border-border p-3 space-y-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">
                  Photo du conducteur <span className="font-normal">(optionnelle)</span>
                </p>
                <div className="flex items-center gap-3">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={watch('profileImageUrl') || pendingPhoto?.previewUrl || undefined} alt="Photo" />
                    <AvatarFallback>
                      {(fullName || '?').split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                    <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
                      <Camera className="h-3.5 w-3.5 mr-1.5" />
                      {watch('profileImageUrl') ? 'Changer la photo' : 'Choisir une photo'}
                    </Button>
                    {watch('profileImageUrl') && !pendingPhoto && (
                      <Button type="button" variant="ghost" size="sm" onClick={handlePhotoRemove}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Retirer
                      </Button>
                    )}
                  </div>
                </div>
                {pendingPhoto && (
                  <div className="rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-center gap-2.5">
                      <img src={pendingPhoto.previewUrl} alt="Aperçu" className="h-12 w-12 rounded-md object-cover border border-border flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" title={pendingPhoto.file.name}>{pendingPhoto.file.name}</p>
                        <p className="text-[11px] text-muted-foreground">{(pendingPhoto.file.size / 1024 / 1024).toFixed(2)} Mo</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button type="button" size="sm" onClick={handlePhotoUpload} disabled={uploadingPhoto}>
                        {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1.5" />}
                        Téléverser
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={handlePhotoCancel} disabled={uploadingPhoto}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-dashed border-border p-3 space-y-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">
                  Documents KYC <span className="font-normal">(optionnels — peuvent être ajoutés plus tard)</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pièce d'identité</Label>
                    <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/40 bg-background">
                      {uploadingId ? <Loader2 className="h-4 w-4 animate-spin" /> : idProofUrl ? <FileCheck className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4" />}
                      <span className="text-xs">{idProofUrl ? 'Téléchargée' : 'Choisir un fichier'}</span>
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleIdUpload} disabled={uploadingId} />
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Permis de conduire</Label>
                    <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/40 bg-background">
                      {uploadingLicense ? <Loader2 className="h-4 w-4 animate-spin" /> : licenseUrl ? <FileCheck className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4" />}
                      <span className="text-xs">{licenseUrl ? 'Téléchargé' : 'Choisir un fichier'}</span>
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleLicenseUpload} disabled={uploadingLicense} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
                <p className="text-xs text-foreground">
                  📋 <strong>Prochaine étape</strong> après création :
                  <span className="block mt-0.5 text-muted-foreground">Approuver le KYC — le conducteur sera automatiquement activé.</span>
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeAndPrepareReset} disabled={submitting}>
                  Annuler
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Créer le conducteur
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Conducteur créé
              </DialogTitle>
              <DialogDescription>
                Partagez ces identifiants avec le conducteur, puis approuvez son KYC.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Nom</span>
                  <span className="font-medium">{created.fullName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Téléphone</span>
                  <span className="font-mono font-medium">{created.phoneNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">PIN</span>
                  <span className="font-mono font-bold text-lg tracking-widest">{created.pin}</span>
                </div>
              </div>

              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-warning text-warning-foreground text-xs font-bold">!</span>
                  Prochaine étape
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Approuvez le KYC</strong> du conducteur — il sera automatiquement activé et pourra louer un véhicule.
                </p>
              </div>

              <div className="rounded-lg border p-3 bg-card">
                <p className="text-xs text-muted-foreground mb-1">Message WhatsApp à envoyer :</p>
                <pre className="text-xs whitespace-pre-wrap break-all font-mono text-muted-foreground leading-relaxed">{whatsappMessage}</pre>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={copyMessage} className="w-full sm:w-auto">
                <Copy className="h-4 w-4 mr-2" />
                Copier le message
              </Button>
              <Button type="button" variant="outline" onClick={closeAndPrepareReset} className="w-full sm:w-auto">
                Fermer
              </Button>
              {onViewProfile && (
                <Button
                  type="button"
                  onClick={() => onViewProfile(created.driverId)}
                  className="w-full sm:w-auto"
                >
                  Approuver le KYC →
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
