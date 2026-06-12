import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, Loader2, Save, Upload,
  User, Phone, FileCheck, Car, Banknote, KeyRound, CheckCircle2, AlertCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { PinDigitInput } from '@/components/PinDigitInput';
import { PhoneInput, validatePhoneNumber } from '@/components/PhoneInput';
import { supabase } from '@/integrations/supabase/routeClient';
import { useAdminUser } from '@/hooks/useAdminUser';
import { logAction } from '@/hooks/useAuditLog';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type WizardValues = {
  // Step 1 — Personal
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: '' | 'M' | 'F' | 'O';
  nationality: string;
  profileImageUrl: string;
  // Step 2 — Contact
  phoneNumber: string;
  phoneSecondary: string;
  email: string;
  address: string;
  city: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  // Step 3 — KYC / Permis
  permitNumber: string;
  permitCategory: string;
  permitIssueDate: string;
  permitExpiryDate: string;
  idProofUrl: string;
  licenseUrl: string;
  // Step 4 — Vehicle (optional)
  assignVehicle: boolean;
  vehicleId: string;
  // Step 5 — Rental (optional)
  createRental: boolean;
  rentPerDay: string;
  rentalStartDate: string;
  rentalNotes: string;
  // Step 6 — KIRA access
  pin: string;
  mobileMoneyOperator: string;
  mobileMoneyNumber: string;
  notifyByWhatsapp: boolean;
};

const DEFAULTS: WizardValues = {
  firstName: '', lastName: '', dateOfBirth: '', gender: '', nationality: 'CI', profileImageUrl: '',
  phoneNumber: '', phoneSecondary: '', email: '', address: '', city: 'Abidjan',
  emergencyContactName: '', emergencyContactPhone: '',
  permitNumber: '', permitCategory: 'B', permitIssueDate: '', permitExpiryDate: '',
  idProofUrl: '', licenseUrl: '',
  assignVehicle: false, vehicleId: '',
  createRental: false, rentPerDay: '', rentalStartDate: new Date().toISOString().slice(0, 10), rentalNotes: '',
  pin: '', mobileMoneyOperator: 'Wave', mobileMoneyNumber: '', notifyByWhatsapp: true,
};

const DRAFT_KEY = 'admin-driver-create-draft-v1';
const MOBILE_MONEY_OPERATORS = ['Wave', 'Orange Money', 'MTN Mobile Money', 'Moov Money'];
const PERMIT_CATEGORIES = ['A', 'B', 'C', 'D', 'E'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StepDef = { id: number; label: string; short: string; icon: React.ComponentType<{ className?: string }> };
const STEPS: StepDef[] = [
  { id: 1, label: 'Informations personnelles', short: 'Identité', icon: User },
  { id: 2, label: 'Coordonnées', short: 'Contact', icon: Phone },
  { id: 3, label: 'KYC & Permis', short: 'KYC', icon: FileCheck },
  { id: 4, label: 'Véhicule (optionnel)', short: 'Véhicule', icon: Car },
  { id: 5, label: 'Tarif location (optionnel)', short: 'Tarif', icon: Banknote },
  { id: 6, label: 'Accès KIRA Driver', short: 'Accès', icon: KeyRound },
  { id: 7, label: 'Récapitulatif', short: 'Récap', icon: CheckCircle2 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadDraft(): WizardValues | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return { ...DEFAULTS, ...JSON.parse(raw) } as WizardValues;
  } catch {
    return null;
  }
}

function saveDraft(values: WizardValues) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)); } catch { /* ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

async function parseEdgeError(err: unknown): Promise<{ code?: string; error?: string } | null> {
  try {
    const ctx = (err as any)?.context;
    if (ctx && typeof ctx.text === 'function') {
      const t = await ctx.text();
      return t ? JSON.parse(t) : null;
    }
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// Per-step validation
// ---------------------------------------------------------------------------

function validateStep(step: number, v: WizardValues): string | null {
  switch (step) {
    case 1:
      if (!v.firstName.trim()) return 'Prénom obligatoire';
      if (!v.lastName.trim()) return 'Nom obligatoire';
      return null;
    case 2:
      if (!validatePhoneNumber(v.phoneNumber).isValid) return 'Téléphone principal invalide';
      if (v.email.trim() && !EMAIL_REGEX.test(v.email.trim())) return 'Email invalide';
      if (v.phoneSecondary.trim() && !validatePhoneNumber(v.phoneSecondary).isValid) return 'Téléphone secondaire invalide';
      if (v.emergencyContactPhone.trim() && !validatePhoneNumber(v.emergencyContactPhone).isValid) return 'Téléphone d\'urgence invalide';
      return null;
    case 3:
      // KYC is recommended but not strictly required at creation — driver enters pending_kyc status
      if (v.permitExpiryDate && v.permitIssueDate && v.permitExpiryDate < v.permitIssueDate) {
        return 'La date d\'expiration du permis doit être après la date d\'émission';
      }
      return null;
    case 4:
      if (v.assignVehicle && !v.vehicleId) return 'Sélectionnez un véhicule ou décochez l\'option';
      return null;
    case 5:
      if (v.createRental) {
        if (!v.assignVehicle || !v.vehicleId) return 'Une location nécessite un véhicule assigné (étape 4)';
        const rate = Number(v.rentPerDay);
        if (!Number.isFinite(rate) || rate <= 0) return 'Tarif journalier invalide';
        if (!v.rentalStartDate) return 'Date de début obligatoire';
      }
      return null;
    case 6:
      if (!/^\d{4}$/.test(v.pin)) return 'Le PIN doit comporter 4 chiffres';
      if (!v.mobileMoneyOperator) return 'Opérateur Mobile Money obligatoire';
      if (!/^[0-9 +]{8,}$/.test(v.mobileMoneyNumber)) return 'Numéro Mobile Money invalide';
      return null;
    case 7:
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Vehicle picker hook (free vehicles only)
// ---------------------------------------------------------------------------

function useFreeVehicles(enabled: boolean) {
  return useQuery({
    queryKey: ['driver-wizard-free-vehicles'],
    enabled,
    queryFn: async () => {
      const { data: busy } = await supabase
        .from('rentals')
        .select('vehicle_id')
        .in('status', ['pending', 'approved', 'active', 'paid', 'return_pending', 'overdue_return', 'payment_overdue', 'vehicle_disabled']);
      const busyIds = new Set((busy ?? []).map((r: any) => r.vehicle_id));
      const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('id, model_name, license_plate, rent_per_day, status')
        .order('model_name', { ascending: true });
      if (error) throw error;
      return (vehicles ?? []).filter((v: any) => !busyIds.has(v.id) && v.status !== 'maintenance');
    },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DriverCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { customerId } = useAdminUser();
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<WizardValues>(() => loadDraft() ?? DEFAULTS);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingId, setUploadingId] = useState(false);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [duplicateCheck, setDuplicateCheck] = useState<'idle' | 'checking' | 'duplicate' | 'unique'>('idle');
  const [createdDriver, setCreatedDriver] = useState<{ id: string; pin: string; phone: string; name: string } | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<boolean>(() => !!loadDraft());
  const draftSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vehicleQuery = useFreeVehicles(step === 4 || step === 5 || step === 7);

  // Autosave draft (debounced)
  useEffect(() => {
    if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    draftSaveRef.current = setTimeout(() => saveDraft(values), 600);
    return () => { if (draftSaveRef.current) clearTimeout(draftSaveRef.current); };
  }, [values]);

  // Duplicate phone detection on step 2 blur
  useEffect(() => {
    if (step !== 2) return;
    const phone = values.phoneNumber.trim();
    if (!validatePhoneNumber(phone).isValid) { setDuplicateCheck('idle'); return; }
    setDuplicateCheck('checking');
    let cancelled = false;
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id')
        .eq('phone_number', phone)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) { setDuplicateCheck('idle'); return; }
      setDuplicateCheck(data ? 'duplicate' : 'unique');
    }, 500);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [values.phoneNumber, step]);

  const set = <K extends keyof WizardValues>(key: K, val: WizardValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setStepError(null);
  };

  const goNext = () => {
    const err = validateStep(step, values);
    if (err) { setStepError(err); toast.error(err); return; }
    if (step === 2 && duplicateCheck === 'duplicate') {
      setStepError('Ce numéro est déjà utilisé');
      toast.error('Ce numéro est déjà utilisé par un autre conducteur');
      return;
    }
    setStepError(null);
    setStep((s) => Math.min(STEPS.length, s + 1));
  };

  const goPrev = () => { setStepError(null); setStep((s) => Math.max(1, s - 1)); };

  const handleDiscardDraft = () => {
    clearDraft();
    setValues(DEFAULTS);
    setRestoredDraft(false);
    setStep(1);
    toast.success('Brouillon supprimé');
  };

  // -------------------------------------------------------------------------
  // File uploads
  // -------------------------------------------------------------------------

  const uploadKyc = async (file: File, prefix: string): Promise<string | null> => {
    if (file.size > 8 * 1024 * 1024) { toast.error('Fichier > 8 Mo'); return null; }
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `admin-wizard/${prefix}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('kyc-documents').upload(path, file, { upsert: false });
    if (error) { toast.error(`Upload échoué: ${error.message}`); return null; }
    return path;
  };

  const onIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingId(true);
    const path = await uploadKyc(file, 'id');
    if (path) { set('idProofUrl', path); toast.success('Pièce d\'identité téléversée'); }
    setUploadingId(false);
    e.target.value = '';
  };

  const onLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingLicense(true);
    const path = await uploadKyc(file, 'license');
    if (path) { set('licenseUrl', path); toast.success('Permis téléversé'); }
    setUploadingLicense(false);
    e.target.value = '';
  };

  const onPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Format image requis'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image > 5 Mo'); return; }
    if (!customerId) { toast.error('Aucun client sélectionné'); return; }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${customerId}/wizard/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
      set('profileImageUrl', data.publicUrl);
      toast.success('Photo téléversée');
    } catch (err: any) {
      toast.error(err?.message || 'Upload échoué');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const handleSubmit = async () => {
    // Final pass through all steps
    for (let i = 1; i <= 6; i++) {
      const err = validateStep(i, values);
      if (err) { setStepError(err); setStep(i); toast.error(err); return; }
    }

    setSubmitting(true);
    try {
      // 1) Create the driver via edge function (auth + profile)
      const fullName = `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
      const { data: created, error: createErr } = await supabase.functions.invoke('create-managed-driver', {
        body: {
          fullName,
          phoneNumber: values.phoneNumber,
          pin: values.pin,
          email: values.email.trim() || undefined,
          bankName: values.mobileMoneyOperator,
          bankAccountNumber: values.mobileMoneyNumber,
          idProofUrl: values.idProofUrl || undefined,
          licenseUrl: values.licenseUrl || undefined,
          profileImageUrl: values.profileImageUrl || undefined,
          customerId: customerId ?? undefined,
        },
      });

      if (createErr) {
        const parsed = await parseEdgeError(createErr);
        toast.error(parsed?.error || createErr.message || 'Échec de la création');
        return;
      }
      if (created?.error) {
        toast.error(created.error);
        return;
      }

      const driverId = created.driverId as string;

      // 2) Patch the new structured fields directly (edge function only stores legacy columns)
      const extraPayload: Record<string, any> = {
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        display_name: fullName,
        date_of_birth: values.dateOfBirth || null,
        gender: values.gender || null,
        nationality: values.nationality || null,
        phone_secondary: values.phoneSecondary.trim() || null,
        address: values.address.trim() || null,
        city: values.city.trim() || null,
        emergency_contact_name: values.emergencyContactName.trim() || null,
        emergency_contact_phone: values.emergencyContactPhone.trim() || null,
        permit_number: values.permitNumber.trim() || null,
        permit_category: values.permitCategory || null,
        permit_issue_date: values.permitIssueDate || null,
        permit_expiry_date: values.permitExpiryDate || null,
      };
      const { error: patchErr } = await supabase.from('drivers').update(extraPayload).eq('id', driverId);
      if (patchErr) {
        // Non-fatal: surface but continue
        toast.warning(`Conducteur créé mais champs additionnels non enregistrés: ${patchErr.message}`);
      }

      // 3) Optional rental
      if (values.createRental && values.assignVehicle && values.vehicleId) {
        const rate = Number(values.rentPerDay);
        const { error: rentErr } = await supabase.from('rentals').insert({
          driver_id: driverId,
          vehicle_id: values.vehicleId,
          start_date: values.rentalStartDate,
          rent_per_day: rate,
          status: 'active',
          notes: values.rentalNotes.trim() || null,
          customer_id: customerId ?? undefined,
        } as any);
        if (rentErr) {
          toast.warning(`Conducteur créé mais location non créée: ${rentErr.message}`);
        }
      }

      // 4) Audit + cleanup
      try {
        await supabase.rpc('driver_log', {
          _driver_id: driverId,
          _action: 'driver_created_wizard',
          _details: { source: 'admin_wizard', with_rental: values.createRental, with_vehicle: values.assignVehicle },
        } as any);
      } catch { /* non-fatal */ }

      logAction({ action: 'driver_created', targetType: 'driver', targetId: driverId, details: { wizard: true } });
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
      clearDraft();
      setCreatedDriver({ id: driverId, pin: values.pin, phone: values.phoneNumber, name: fullName });
      toast.success('Conducteur créé avec succès');
    } catch (e: any) {
      toast.error(e?.message || 'Erreur inattendue');
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // SUCCESS PAGE
  // -------------------------------------------------------------------------

  if (createdDriver) {
    const waMessage = `Bonjour ${createdDriver.name},\nVotre compte DAM Flotte est prêt.\n📱 Téléphone: ${createdDriver.phone}\n🔐 PIN: ${createdDriver.pin}\nConnectez-vous sur: https://drivedam.com/driver/login`;
    return (
      <div className="min-h-screen bg-muted/30 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Card className="p-8 text-center space-y-6">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Conducteur créé</h1>
              <p className="text-muted-foreground mt-1">{createdDriver.name} • {createdDriver.phone}</p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Code PIN provisoire</span>
                <span className="font-mono font-semibold text-lg tracking-widest">{createdDriver.pin}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Partagez ces identifiants au conducteur. Il pourra modifier son PIN après la première connexion.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild className="flex-1">
                <Link to={`/admin/drivers/${createdDriver.id}`}>Ouvrir le profil</Link>
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => {
                navigator.clipboard.writeText(waMessage).then(() => toast.success('Message copié'));
              }}>
                Copier message WhatsApp
              </Button>
              <Button variant="ghost" onClick={() => {
                setCreatedDriver(null);
                setValues(DEFAULTS);
                setStep(1);
              }}>
                Créer un autre
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  const currentStep = STEPS.find((s) => s.id === step)!;

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/drivers')}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Retour
            </Button>
            <div>
              <h1 className="font-semibold text-sm sm:text-base">Nouveau conducteur</h1>
              <p className="text-xs text-muted-foreground">Étape {step} sur {STEPS.length} — {currentStep.label}</p>
            </div>
          </div>
          {restoredDraft && (
            <Button variant="outline" size="sm" onClick={handleDiscardDraft}>
              <Save className="h-3 w-3 mr-1" /> Supprimer brouillon
            </Button>
          )}
        </div>
        {/* Stepper */}
        <div className="mx-auto max-w-5xl px-4 pb-3 overflow-x-auto">
          <ol className="flex items-center gap-2 min-w-max">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const isDone = step > s.id;
              const isActive = step === s.id;
              return (
                <li key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { if (s.id < step) setStep(s.id); }}
                    disabled={s.id > step}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition',
                      isActive && 'bg-primary text-primary-foreground',
                      isDone && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                      !isActive && !isDone && 'bg-muted text-muted-foreground cursor-not-allowed',
                    )}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    <span>{s.id}. {s.short}</span>
                  </button>
                  {s.id < STEPS.length && <span className="text-muted-foreground/40">›</span>}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {restoredDraft && step === 1 && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Brouillon restauré automatiquement. Vous pouvez continuer ou le supprimer.</span>
          </div>
        )}

        <Card className="p-5 sm:p-7 space-y-5">
          {/* ---------------- STEP 1 ---------------- */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                  {values.profileImageUrl ? (
                    <img src={values.profileImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="cursor-pointer inline-flex items-center gap-2 text-sm">
                    <input type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} disabled={uploadingPhoto} />
                    <Button type="button" variant="outline" size="sm" disabled={uploadingPhoto} asChild>
                      <span>
                        {uploadingPhoto ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                        {values.profileImageUrl ? 'Changer la photo' : 'Photo de profil'}
                      </span>
                    </Button>
                  </Label>
                  <p className="text-xs text-muted-foreground">JPG/PNG ≤ 5 Mo (optionnel)</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Prénom <span className="text-destructive">*</span></Label>
                  <Input value={values.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Jean" autoComplete="given-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Nom <span className="text-destructive">*</span></Label>
                  <Input value={values.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Kouassi" autoComplete="family-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Date de naissance</Label>
                  <Input type="date" value={values.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Genre</Label>
                  <Select value={values.gender || 'unspec'} onValueChange={(v) => set('gender', v === 'unspec' ? '' : (v as 'M' | 'F' | 'O'))}>
                    <SelectTrigger><SelectValue placeholder="Non précisé" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unspec">Non précisé</SelectItem>
                      <SelectItem value="M">Homme</SelectItem>
                      <SelectItem value="F">Femme</SelectItem>
                      <SelectItem value="O">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nationalité</Label>
                  <Input value={values.nationality} onChange={(e) => set('nationality', e.target.value)} placeholder="CI" />
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 2 ---------------- */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Téléphone principal <span className="text-destructive">*</span></Label>
                <PhoneInput value={values.phoneNumber} onChange={(v) => set('phoneNumber', v)} defaultCountry="CI" />
                {duplicateCheck === 'checking' && <p className="text-xs text-muted-foreground">Vérification…</p>}
                {duplicateCheck === 'duplicate' && <p className="text-xs text-destructive">⚠ Ce numéro est déjà utilisé par un autre conducteur</p>}
                {duplicateCheck === 'unique' && <p className="text-xs text-emerald-600">✓ Numéro disponible</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Téléphone secondaire</Label>
                <PhoneInput value={values.phoneSecondary} onChange={(v) => set('phoneSecondary', v)} defaultCountry="CI" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={values.email} onChange={(e) => set('email', e.target.value)} placeholder="jean@example.com" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Adresse</Label>
                  <Textarea rows={2} value={values.address} onChange={(e) => set('address', e.target.value)} placeholder="Quartier, rue…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Ville</Label>
                  <Input value={values.city} onChange={(e) => set('city', e.target.value)} />
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-2">Contact d'urgence</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nom</Label>
                    <Input value={values.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Téléphone</Label>
                    <PhoneInput value={values.emergencyContactPhone} onChange={(v) => set('emergencyContactPhone', v)} defaultCountry="CI" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 3 ---------------- */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Le KYC peut être complété plus tard depuis le profil. Le conducteur démarre avec le statut <Badge variant="secondary">pending_kyc</Badge> tant qu'il n'est pas approuvé.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>N° de permis</Label>
                  <Input value={values.permitNumber} onChange={(e) => set('permitNumber', e.target.value)} placeholder="CI-XXXXXX" />
                </div>
                <div className="space-y-1.5">
                  <Label>Catégorie</Label>
                  <Select value={values.permitCategory} onValueChange={(v) => set('permitCategory', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERMIT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>Catégorie {c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date d'émission</Label>
                  <Input type="date" value={values.permitIssueDate} onChange={(e) => set('permitIssueDate', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Date d'expiration</Label>
                  <Input type="date" value={values.permitExpiryDate} onChange={(e) => set('permitExpiryDate', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                <div className="space-y-1.5">
                  <Label>Pièce d'identité (CNI / passeport)</Label>
                  <Label className="block">
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onIdUpload} disabled={uploadingId} />
                    <Button type="button" variant="outline" className="w-full" disabled={uploadingId} asChild>
                      <span>
                        {uploadingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : values.idProofUrl ? <Check className="h-4 w-4 mr-2 text-emerald-600" /> : <Upload className="h-4 w-4 mr-2" />}
                        {values.idProofUrl ? 'Téléversé — remplacer' : 'Téléverser une pièce'}
                      </span>
                    </Button>
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label>Permis de conduire</Label>
                  <Label className="block">
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onLicenseUpload} disabled={uploadingLicense} />
                    <Button type="button" variant="outline" className="w-full" disabled={uploadingLicense} asChild>
                      <span>
                        {uploadingLicense ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : values.licenseUrl ? <Check className="h-4 w-4 mr-2 text-emerald-600" /> : <Upload className="h-4 w-4 mr-2" />}
                        {values.licenseUrl ? 'Téléversé — remplacer' : 'Téléverser le permis'}
                      </span>
                    </Button>
                  </Label>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 4 ---------------- */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox id="assign-vehicle" checked={values.assignVehicle} onCheckedChange={(c) => set('assignVehicle', c === true)} />
                <div>
                  <Label htmlFor="assign-vehicle" className="cursor-pointer">Assigner un véhicule maintenant</Label>
                  <p className="text-xs text-muted-foreground">Vous pouvez aussi le faire plus tard depuis le profil du conducteur.</p>
                </div>
              </div>
              {values.assignVehicle && (
                <div className="space-y-2 pl-7">
                  <Label>Véhicule disponible</Label>
                  {vehicleQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground"><Loader2 className="h-3 w-3 inline animate-spin mr-1" /> Chargement…</p>
                  ) : vehicleQuery.data && vehicleQuery.data.length > 0 ? (
                    <Select value={values.vehicleId} onValueChange={(v) => {
                      set('vehicleId', v);
                      const vehicle = vehicleQuery.data?.find((x: any) => x.id === v);
                      if (vehicle?.rent_per_day && !values.rentPerDay) set('rentPerDay', String(vehicle.rent_per_day));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner un véhicule" /></SelectTrigger>
                      <SelectContent>
                        {vehicleQuery.data.map((v: any) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.model_name} — {v.license_plate}
                            {v.rent_per_day ? ` (${formatCurrency(v.rent_per_day)}/jour)` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucun véhicule disponible. <Link to="/admin/vehicles" className="text-primary underline">Ajouter un véhicule</Link></p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---------------- STEP 5 ---------------- */}
          {step === 5 && (
            <div className="space-y-4">
              {!values.assignVehicle ? (
                <p className="text-sm text-muted-foreground">Aucun véhicule sélectionné à l'étape précédente — étape ignorée.</p>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <Checkbox id="create-rental" checked={values.createRental} onCheckedChange={(c) => set('createRental', c === true)} />
                    <div>
                      <Label htmlFor="create-rental" className="cursor-pointer">Créer un contrat de location actif</Label>
                      <p className="text-xs text-muted-foreground">Une location active sera créée pour ce conducteur et ce véhicule.</p>
                    </div>
                  </div>
                  {values.createRental && (
                    <div className="space-y-3 pl-7">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Tarif journalier (FCFA) <span className="text-destructive">*</span></Label>
                          <Input type="number" min="0" value={values.rentPerDay} onChange={(e) => set('rentPerDay', e.target.value)} placeholder="15000" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Date de début <span className="text-destructive">*</span></Label>
                          <Input type="date" value={values.rentalStartDate} onChange={(e) => set('rentalStartDate', e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Notes</Label>
                        <Textarea rows={2} value={values.rentalNotes} onChange={(e) => set('rentalNotes', e.target.value)} placeholder="Conditions particulières…" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ---------------- STEP 6 ---------------- */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Code PIN à 4 chiffres <span className="text-destructive">*</span></Label>
                <PinDigitInput value={values.pin} onChange={(v) => set('pin', v)} />
                <p className="text-xs text-muted-foreground text-center">Le conducteur l'utilisera pour se connecter à l'app mobile.</p>
              </div>
              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-medium">Compte Mobile Money pour paiements & retraits</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Opérateur <span className="text-destructive">*</span></Label>
                    <Select value={values.mobileMoneyOperator} onValueChange={(v) => set('mobileMoneyOperator', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MOBILE_MONEY_OPERATORS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Numéro Mobile Money <span className="text-destructive">*</span></Label>
                    <Input value={values.mobileMoneyNumber} onChange={(e) => set('mobileMoneyNumber', e.target.value)} placeholder="+225 07 00 00 00 00" />
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 pt-2">
                <Checkbox id="notify-wa" checked={values.notifyByWhatsapp} onCheckedChange={(c) => set('notifyByWhatsapp', c === true)} />
                <Label htmlFor="notify-wa" className="cursor-pointer text-sm">
                  Préparer un message WhatsApp avec les identifiants à la fin
                </Label>
              </div>
            </div>
          )}

          {/* ---------------- STEP 7 — RECAP ---------------- */}
          {step === 7 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Vérifiez les informations puis confirmez la création.</p>
              <RecapBlock title="Identité" rows={[
                ['Nom complet', `${values.firstName} ${values.lastName}`.trim() || '—'],
                ['Date de naissance', values.dateOfBirth || '—'],
                ['Genre', values.gender || '—'],
                ['Nationalité', values.nationality || '—'],
              ]} />
              <RecapBlock title="Contact" rows={[
                ['Téléphone', values.phoneNumber || '—'],
                ['Téléphone secondaire', values.phoneSecondary || '—'],
                ['Email', values.email || '—'],
                ['Adresse', `${values.address}${values.city ? ', ' + values.city : ''}` || '—'],
                ['Contact d\'urgence', values.emergencyContactName ? `${values.emergencyContactName} (${values.emergencyContactPhone})` : '—'],
              ]} />
              <RecapBlock title="Permis & KYC" rows={[
                ['N° permis', values.permitNumber || '—'],
                ['Catégorie', values.permitCategory || '—'],
                ['Expiration', values.permitExpiryDate || '—'],
                ['Pièce d\'identité', values.idProofUrl ? '✓ Téléversée' : '— À compléter plus tard'],
                ['Permis', values.licenseUrl ? '✓ Téléversé' : '— À compléter plus tard'],
              ]} />
              <RecapBlock title="Véhicule & location" rows={[
                ['Véhicule', values.assignVehicle && values.vehicleId
                  ? (vehicleQuery.data?.find((v: any) => v.id === values.vehicleId)?.model_name || 'Sélectionné')
                  : 'Aucun (à assigner plus tard)'],
                ['Location', values.createRental ? `Active — ${formatCurrency(Number(values.rentPerDay) || 0)}/jour` : 'Aucune'],
              ]} />
              <RecapBlock title="Accès KIRA" rows={[
                ['PIN', values.pin ? '••••' : '—'],
                ['Mobile Money', `${values.mobileMoneyOperator} — ${values.mobileMoneyNumber}`],
              ]} />
            </div>
          )}

          {stepError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm px-3 py-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {stepError}
            </div>
          )}
        </Card>

        {/* Footer nav */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" onClick={goPrev} disabled={step === 1 || submitting}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Précédent
          </Button>
          {step < STEPS.length ? (
            <Button onClick={goNext} disabled={submitting}>
              Suivant <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="min-w-[180px]">
              {submitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Création…</>) : (<>Créer le conducteur <Check className="h-4 w-4 ml-2" /></>)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recap sub-component
// ---------------------------------------------------------------------------

function RecapBlock({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-dashed border-border/50 py-1">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium text-right truncate max-w-[60%]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}