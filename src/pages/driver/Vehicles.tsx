import { useState, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { VehicleCard } from '@/components/VehicleCard';
import { resolveVehicleImage } from '@/lib/vehicleImages';
import { supabase } from '@/integrations/supabase/routeClient';
import { UI } from '@/lib/i18n';
import { KycGate } from '@/components/KycGate';
import { formatCurrency, formatDateShort, formatRelativeTime } from '@/lib/format';
import { useDriverId, useDriverRentals, useDriverFavorites, useToggleFavorite, useDriverPayments, useCreateSupportTicket } from '@/hooks/useDriverData';
import { useDriverFullProfile } from '@/hooks/useDriverProfile';
import { useVehiclesRealtime } from '@/hooks/useDriverRealtimeSubscription';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HapticButton } from '@/components/HapticButton';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  Bike,
  Calendar,
  Camera,
  Car,
  Check,
  CheckCircle,
  ClipboardCheck,
  Clock,
  FileText,
  Gauge,
  History,
  Loader2,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UploadCloud,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { FLEET_CATEGORIES, type FleetCategory } from '@/lib/fleetCategories';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useDriverActiveInspection } from '@/hooks/useDriverActiveInspection';
import { useRealtimePostgresChanges } from '@/hooks/useRealtimePostgresChanges';
import {
  DOCUMENT_ZONES,
  STATUS_LABEL as FLEET_CONTROL_STATUS_LABEL,
  type FleetControlStatus,
  type ItemValidation,
  type ZoneKey,
} from '@/lib/fleetControl';
import {
  DRIVER_DOCUMENT_STATUS_LABEL,
  VEHICLE_OPS_STATUS_META,
  deriveDriverDocumentStatus,
  deriveVehicleOpsStatus,
  nextDueDateLabel,
  type VehicleOpsStatus,
} from '@/lib/driverOps';

interface Vehicle {
  id: string;
  model_name: string;
  make?: string | null;
  license_plate: string;
  vehicle_type: 'car' | 'bike';
  fleet_group?: string | null;
  rent_per_day: number;
  status: 'available' | 'rented' | 'maintenance';
  image_url?: string | null;
  year?: number | null;
}

type SortOption = 'name' | 'price-asc' | 'price-desc' | 'availability';
type StatusFilter = 'all' | 'available' | 'rented' | 'maintenance';
type TypeFilter = 'all' | FleetCategory;
type ProblemCategory = 'tire' | 'brakes' | 'engine' | 'accident' | 'cleaning' | 'body' | 'other';
type ProblemUrgency = 'low' | 'normal' | 'high' | 'urgent';

const ACTIVE_DRIVER_RENTAL_STATUSES = ['active', 'return_pending', 'overdue_return', 'payment_overdue', 'vehicle_disabled'] as const;
const isActiveDriverRentalStatus = (status: string | null | undefined) =>
  !!status && (ACTIVE_DRIVER_RENTAL_STATUSES as readonly string[]).includes(status);

const PROBLEM_CATEGORIES: Array<{ value: ProblemCategory; label: string }> = [
  { value: 'tire', label: 'Pneu' },
  { value: 'brakes', label: 'Freins' },
  { value: 'engine', label: 'Moteur' },
  { value: 'accident', label: 'Accident' },
  { value: 'cleaning', label: 'Nettoyage' },
  { value: 'body', label: 'Carrosserie' },
  { value: 'other', label: 'Autre' },
];

const PROBLEM_URGENCIES: Array<{ value: ProblemUrgency; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Faible' },
  { value: 'high', label: 'Élevé' },
  { value: 'urgent', label: 'Urgent' },
];

const REPORT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const REPORT_PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const REPORT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  reported: 'Signalé',
  draft: 'Signalé',
  to_validate: 'En cours d’analyse',
  analysis: 'En cours d’analyse',
  approved: 'Approuvé',
  in_progress: 'En réparation',
  repairing: 'En réparation',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const VEHICLE_STATUS_CLASS: Record<VehicleOpsStatus, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  maintenance_required: 'border-amber-200 bg-amber-50 text-amber-900',
  control_required: 'border-amber-200 bg-amber-50 text-amber-900',
  immobilized: 'border-red-200 bg-red-50 text-red-900',
  return_requested: 'border-orange-200 bg-orange-50 text-orange-900',
  repairing: 'border-red-200 bg-red-50 text-red-900',
};

function useRequestRental() {
  const queryClient = useQueryClient();
  const { data: driverId } = useDriverId();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ vehicleId }: { vehicleId: string }) => {
      if (!driverId) throw new Error('Profil conducteur non trouvé. Veuillez compléter votre inscription.');

      // Driver-side guard: block suspended/inactive accounts before they can
      // insert. The DriverRouteGuard already kicks them out of the app, but
      // this protects against stale sessions or direct API misuse.
      const { data: driverRow, error: driverErr } = await supabase
        .from('drivers')
        .select('driver_status')
        .eq('id', driverId)
        .maybeSingle();
      if (driverErr) throw driverErr;
      if (driverRow?.driver_status === 'suspended') {
        throw new Error('Compte suspendu. Contactez votre gestionnaire de flotte.');
      }
      if (driverRow?.driver_status === 'inactive') {
        throw new Error('Compte inactif. Contactez votre gestionnaire de flotte.');
      }

      // Block if driver already has a rental in any "in-flight" status.
      // 'approved' counts because the vehicle is reserved for the driver until
      // it transitions to 'active' or is cancelled.
      const { data: existingRentals, error: checkError } = await supabase
        .from('rentals')
        .select('id, status')
        .eq('driver_id', driverId)
        .in('status', ['active', 'pending', 'approved']);

      if (checkError) throw checkError;

      if (existingRentals && existingRentals.length > 0) {
        const hasActive = existingRentals.some(r => r.status === 'active');
        const hasApproved = existingRentals.some(r => r.status === 'approved');
        const hasPending = existingRentals.some(r => r.status === 'pending');

        if (hasActive) {
          throw new Error('Vous avez déjà une location active. Terminez-la avant d\'en demander une nouvelle.');
        }
        if (hasApproved) {
          throw new Error('Une location est déjà approuvée pour vous. Récupérez le véhicule pour la démarrer.');
        }
        if (hasPending) {
          throw new Error('Vous avez déjà une demande en attente. Attendez sa validation.');
        }
      }

      const startDate = new Date().toISOString().split('T')[0];

      // Use maybeSingle() to tolerate cases where RLS does not return the row
      // back to the driver after insert. The row exists either way; we only
      // need to know the insert succeeded without throwing PGRST116.
      const insertPromise = supabase
        .from('rentals')
        .insert({
          driver_id: driverId,
          vehicle_id: vehicleId,
          start_date: startDate,
          status: 'pending',
        })
        .select('id')
        .maybeSingle();

      // Hard 15s safety net so the UI never gets stuck on "Chargement…".
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('La demande prend trop de temps. Vérifiez votre connexion et réessayez.')), 15000);
      });

      const { data, error } = (await Promise.race([insertPromise, timeoutPromise])) as Awaited<typeof insertPromise>;

      if (error) {
        // Translate the unique-index violation into a friendly message instead
        // of leaking the raw Postgres error to the driver.
        if (error.message?.includes('idx_rentals_no_double_booking') || error.message?.includes('uniq_driver_one_open_rental')) {
          throw new Error('Une demande est déjà en cours pour vous. Patientez ou consultez vos locations.');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverRentals'] });
      queryClient.invalidateQueries({ queryKey: ['driverVehicles'] });
      toast.success('Demande envoyée!', {
        description: 'Vous serez notifié dès que votre demande sera traitée.',
      });
      navigate('/driver/rental');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la demande');
    },
  });
}

interface RentalRequestDialogProps {
  vehicle: Vehicle | null;
  isOpen: boolean;
  onClose: () => void;
  hasActiveRental: boolean;
  hasPendingRental: boolean;
  kycStatus: string;
}

function RentalRequestDialog({ vehicle, isOpen, onClose, hasActiveRental, hasPendingRental, kycStatus }: RentalRequestDialogProps) {
  const requestRental = useRequestRental();

  if (!vehicle) return null;

  const isKycApproved = kycStatus === 'verified' || kycStatus === 'approved';
  const canRequest = !hasActiveRental && !hasPendingRental && vehicle.status === 'available' && isKycApproved;
  // Default to car icon when vehicle_type is missing/unknown (matches VehicleCard behaviour).
  const VehicleIcon = vehicle.vehicle_type === 'bike' ? Bike : Car;

  const handleSubmit = () => {
    requestRental.mutate(
      { vehicleId: vehicle.id },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VehicleIcon className="h-5 w-5 text-primary" />
            {vehicle.model_name}
          </DialogTitle>
          <DialogDescription>
            {vehicle.license_plate}
          </DialogDescription>
        </DialogHeader>

        {/* Vehicle Image */}
        <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
          {(() => {
            const resolved = resolveVehicleImage(vehicle.image_url, vehicle.model_name);
            return resolved ? (
              <img
                src={resolved}
                alt={vehicle.model_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <VehicleIcon className="h-16 w-16 text-muted-foreground" />
            );
          })()}
        </div>

        {/* Warnings */}
        {hasActiveRental && (
          <Card className="border-warning/50 bg-warning/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Location active</p>
                <p className="text-xs text-muted-foreground">
                  Vous avez déjà une location en cours. Terminez-la avant d'en demander une nouvelle.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {hasPendingRental && !hasActiveRental && (
          <Card className="border-secondary/50 bg-secondary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Demande en attente</p>
                <p className="text-xs text-muted-foreground">
                  Vous avez déjà une demande en cours de traitement.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isKycApproved && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Vérification requise</p>
                <p className="text-xs text-muted-foreground">
                  Votre identité doit être vérifiée avant de pouvoir louer un véhicule.{' '}
                  <a href="/driver/kyc" className="text-primary underline">Compléter la vérification</a>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily-only rental summary */}
        {canRequest && (
          <div className="space-y-2">
            <Label className="text-base font-semibold">Tarif location</Label>
            <div className="flex items-center justify-between p-4 rounded-lg border-2 border-primary bg-primary/5">
              <div>
                <p className="font-medium">Location à la journée</p>
                <p className="text-xs text-muted-foreground">Paiement quotidien</p>
              </div>
              <span className="font-semibold text-primary">
                {formatCurrency(vehicle.rent_per_day)}/jour
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {UI.CANCEL}
          </Button>
          <HapticButton 
            className="flex-1" 
            disabled={!canRequest || requestRental.isPending}
            onClick={handleSubmit}
            hapticType="success"
          >
            {requestRental.isPending ? UI.LOADING : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Demander
              </>
            )}
          </HapticButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface VehicleReport {
  id: string;
  category: ProblemCategory;
  urgency: ProblemUrgency;
  description: string;
  status: string;
  created_at: string;
}

interface MaintenanceOrder {
  id: string;
  order_type: string;
  status: string;
  priority: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface InspectionDocumentItem {
  id: string;
  zone: ZoneKey;
  validation_status: ItemValidation;
  rejection_reason: string | null;
  created_at?: string | null;
}

function ReportProblemDialog({
  isOpen,
  onClose,
  vehicle,
  driverId,
  customerId,
  onSubmitted,
}: {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  driverId: string | null | undefined;
  customerId: string | null | undefined;
  onSubmitted: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createTicket = useCreateSupportTicket();
  const [category, setCategory] = useState<ProblemCategory>('tire');
  const [urgency, setUrgency] = useState<ProblemUrgency>('normal');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = !!vehicle && !!driverId && description.trim().length >= 10;
  const categoryLabel = PROBLEM_CATEGORIES.find((c) => c.value === category)?.label ?? category;
  const urgencyLabel = PROBLEM_URGENCIES.find((u) => u.value === urgency)?.label ?? urgency;

  const reset = () => {
    setCategory('tire');
    setUrgency('normal');
    setDescription('');
    setPhotos([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const files = selected.filter((file) => {
      if (!REPORT_PHOTO_ALLOWED_TYPES.has(file.type)) {
        toast.error('Format non supporté', {
          description: 'Ajoutez une image JPG, PNG ou WebP.',
        });
        return false;
      }
      if (file.size > REPORT_PHOTO_MAX_BYTES) {
        toast.error('Photo trop lourde', {
          description: 'Chaque photo doit faire 10 Mo maximum.',
        });
        return false;
      }
      return true;
    });
    const limited = [...photos, ...files].slice(0, 4);
    setPhotos(limited);
    if (files.length > 4 || photos.length + files.length > 4) {
      toast.info('Maximum 4 photos par signalement');
    }
  };

  const uploadReportPhotos = async (reportId: string): Promise<string[]> => {
    if (!driverId || photos.length === 0) return [];
    const uploaded: string[] = [];
    for (const [index, file] of photos.entries()) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${driverId}/${reportId}/${Date.now()}-${index}.${ext}`;
      const { error } = await (supabase as any).storage
        .from('maintenance-report-photos')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      uploaded.push(path);
    }
    return uploaded;
  };

  const handleSubmit = async () => {
    if (!canSubmit || !vehicle || !driverId) return;
    setIsSubmitting(true);
    const reportId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const supportDescription = [
        `Signalement véhicule ${vehicle.license_plate} (${vehicle.model_name})`,
        `Catégorie: ${categoryLabel}`,
        `Urgence: ${urgencyLabel}`,
        photos.length ? `Photos sélectionnées: ${photos.length}` : 'Aucune photo jointe',
        '',
        description.trim(),
      ].join('\n');

      const ticket = await createTicket.mutateAsync({
        category: 'technical',
        subject: `Véhicule - ${categoryLabel} - ${vehicle.license_plate}`,
        description: supportDescription,
        priority: urgency === 'urgent' ? 'urgent' : urgency === 'high' ? 'high' : 'normal',
      });

      let photoPaths: string[] = [];
      try {
        photoPaths = await uploadReportPhotos(reportId);
      } catch (photoError) {
        console.warn('Vehicle report photo upload skipped:', photoError);
        toast.warning('Signalement envoyé sans photos', {
          description: 'Le ticket support est créé. Les photos seront à renvoyer si le gestionnaire les demande.',
        });
      }

      try {
        await (supabase as any).from('driver_vehicle_reports').insert({
          id: reportId,
          customer_id: customerId ?? null,
          driver_id: driverId,
          vehicle_id: vehicle.id,
          category,
          urgency,
          description: description.trim(),
          photo_paths: photoPaths,
          status: 'reported',
          support_ticket_id: ticket?.id ?? null,
        });
      } catch (reportError) {
        console.warn('driver_vehicle_reports insert fallback:', reportError);
      }

      toast.success('Problème signalé', {
        description: 'Votre gestionnaire a reçu le signalement.',
      });
      reset();
      onSubmitted();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de créer le signalement';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Signaler un problème
          </DialogTitle>
          <DialogDescription>
            Le signalement est envoyé à votre gestionnaire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as ProblemCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROBLEM_CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Urgence</Label>
              <Select value={urgency} onValueChange={(value) => setUrgency(value as ProblemUrgency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROBLEM_URGENCIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Décrivez le problème, le bruit, le voyant ou l'endroit touché..."
              rows={4}
              maxLength={800}
            />
            <p className="text-[11px] text-muted-foreground">{description.trim().length}/800</p>
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={REPORT_PHOTO_ACCEPT}
              multiple
              className="hidden"
              onChange={handlePhotoChange}
            />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <UploadCloud className="h-4 w-4 mr-2" />
              Ajouter des photos
            </Button>
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((photo, index) => (
                  <div key={`${photo.name}-${index}`} className="rounded-lg border bg-muted/30 p-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Camera className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span className="truncate">{photo.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VehicleStatusCard({ status }: { status: VehicleOpsStatus }) {
  const meta = VEHICLE_OPS_STATUS_META[status];
  return (
    <Card className={cn('border', VEHICLE_STATUS_CLASS[status])}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-background/70 p-2">
            {status === 'active' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">État du véhicule</p>
            <h3 className="text-lg font-bold">{meta.label}</h3>
            <p className="text-sm opacity-80">{meta.description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Vehicles() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('availability');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const { data: driverId } = useDriverId();
  const { data: rentals = [] } = useDriverRentals();
  const { data: payments = [] } = useDriverPayments();
  const { data: favorites = [] } = useDriverFavorites();
  const toggleFavorite = useToggleFavorite();
  const { data: driverProfile } = useDriverFullProfile();
  const { data: activeInspection } = useDriverActiveInspection();
  const queryClient = useQueryClient();

  // Live updates: vehicle status flips from "Disponible" → "Loué" the instant
  // an admin approves a rental, without the driver having to refresh.
  useVehiclesRealtime();
  useRealtimePostgresChanges<{ driver_id?: string; vehicle_id?: string }>(
    'driver_vehicle_reports',
    '*',
    (payload) => (payload.new?.driver_id ?? payload.old?.driver_id) === driverId,
    () => queryClient.invalidateQueries({ queryKey: ['driver-vehicle-reports', driverId, activeVehicle?.id] }),
    !!driverId,
  );

  // Check if driver has active or pending rentals
  const activeRental = useMemo(
    () => (rentals as any[]).find((r) => isActiveDriverRentalStatus(r.status)) ?? null,
    [rentals],
  );
  const hasActiveRental = !!activeRental;
  const hasPendingRental = rentals.some((r: any) => r.status === 'pending');
  const activeVehicle = (activeRental?.vehicle ?? null) as Vehicle | null;

  const activeRentalPayments = useMemo(() => {
    if (!activeRental?.id) return [];
    return (payments as any[]).filter((payment) => payment.rental_id === activeRental.id);
  }, [activeRental?.id, payments]);

  const openRentalPayments = useMemo(() => activeRentalPayments
    .filter((payment) => ['pending', 'partial', 'overdue', 'late'].includes(payment.status))
    .map((payment) => ({
      ...payment,
      remaining: Math.max(0, Number(payment.amount ?? 0) - Number(payment.amount_paid ?? 0)),
    }))
    .filter((payment) => payment.remaining > 0)
    .sort((a, b) => new Date(a.due_date ?? 0).getTime() - new Date(b.due_date ?? 0).getTime()),
  [activeRentalPayments]);

  const nextPayment = openRentalPayments[0] ?? null;
  const currentBalance = openRentalPayments.reduce((sum, payment) => sum + payment.remaining, 0);

  const { data: inspectionDocs = [] } = useQuery({
    queryKey: ['driver-vehicle-docs', activeInspection?.id],
    queryFn: async () => {
      if (!activeInspection?.id) return [];
      const { data, error } = await (supabase as any)
        .from('vehicle_inspection_photos')
        .select('id, zone, validation_status, rejection_reason, created_at')
        .eq('inspection_id', activeInspection.id)
        .in('zone', DOCUMENT_ZONES.map((zone) => zone.key));
      if (error) {
        console.warn('Vehicle docs query failed:', error);
        return [];
      }
      return (data ?? []) as InspectionDocumentItem[];
    },
    enabled: !!activeInspection?.id,
    retry: false,
  });

  const { data: maintenanceOrders = [] } = useQuery({
    queryKey: ['driver-vehicle-maintenance-orders', activeVehicle?.id],
    queryFn: async () => {
      if (!activeVehicle?.id) return [];
      const { data, error } = await (supabase as any)
        .from('maintenance_orders')
        .select('id, order_type, status, priority, description, created_at, updated_at')
        .eq('vehicle_id', activeVehicle.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) {
        console.warn('Maintenance orders query failed:', error);
        return [];
      }
      return (data ?? []) as MaintenanceOrder[];
    },
    enabled: !!activeVehicle?.id,
    retry: false,
  });

  const { data: vehicleReports = [] } = useQuery({
    queryKey: ['driver-vehicle-reports', driverId, activeVehicle?.id],
    queryFn: async () => {
      if (!driverId || !activeVehicle?.id) return [];
      const { data, error } = await (supabase as any)
        .from('driver_vehicle_reports')
        .select('id, category, urgency, description, status, created_at')
        .eq('driver_id', driverId)
        .eq('vehicle_id', activeVehicle.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) {
        console.warn('Vehicle reports query failed:', error);
        return [];
      }
      return (data ?? []) as VehicleReport[];
    },
    enabled: !!driverId && !!activeVehicle?.id,
    retry: false,
  });

  const latestMaintenance = maintenanceOrders.find((order) => !['completed', 'cancelled'].includes(order.status));
  const latestReport = vehicleReports.find((report) => !['completed', 'cancelled'].includes(report.status));
  const vehicleOpsStatus = deriveVehicleOpsStatus({
    vehicleStatus: activeVehicle?.status,
    rentalStatus: activeRental?.status,
    fleetControlStatus: activeInspection?.effective_status as FleetControlStatus | null | undefined,
    maintenanceStatus: latestMaintenance?.status ?? latestReport?.status,
    immobilizationState: activeInspection?.immobilization_state,
  });

  const { data: vehicles = [], isLoading: loading } = useQuery({
    queryKey: ['driverVehicles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('model_name');
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  // Filter and sort vehicles
  const filteredAndSortedVehicles = useMemo(() => {
    let result = [...vehicles];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(v => 
        v.model_name.toLowerCase().includes(query) ||
        v.license_plate.toLowerCase().includes(query)
      );
    }

    // Apply fleet category filter (VTC / WARREN / CARGO / N'LOOTTO)
    if (typeFilter !== 'all') {
      result = result.filter(v => v.fleet_group === typeFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(v => v.status === statusFilter);
    }

    // Apply sorting
    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.model_name.localeCompare(b.model_name));
        break;
      case 'price-asc':
        result.sort((a, b) => a.rent_per_day - b.rent_per_day);
        break;
      case 'price-desc':
        result.sort((a, b) => b.rent_per_day - a.rent_per_day);
        break;
	      case 'availability': {
	        const statusOrder = { available: 0, rented: 1, maintenance: 2 };
	        result.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
	        break;
	      }
	    }

    return result;
  }, [vehicles, searchQuery, typeFilter, statusFilter, sortBy]);

  const handleSelectVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
  };

  const handleToggleFavorite = (vehicleId: string, isFavorite: boolean) => {
    if (!driverId) {
      toast.error('Connectez-vous pour ajouter des favoris');
      return;
    }
    toggleFavorite.mutate({ vehicleId, isFavorite });
  };

  const activeFiltersCount = (typeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: 'Mon véhicule' }]} />
      <PageHeader title="Mon véhicule" subtitle="État, documents et signalements" />
      <KycGate>

      {activeVehicle && (
        <div className="px-4 mb-6 space-y-4">
          <Card className="overflow-hidden">
            <div className="relative aspect-[16/9] bg-muted">
              {(() => {
                const resolved = resolveVehicleImage(activeVehicle.image_url, activeVehicle.model_name);
                return resolved ? (
                  <img
                    src={resolved}
                    alt={activeVehicle.model_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    {activeVehicle.vehicle_type === 'bike' ? <Bike className="h-16 w-16 text-muted-foreground" /> : <Car className="h-16 w-16 text-muted-foreground" />}
                  </div>
                );
              })()}
              <div className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-sm font-bold shadow-sm">
                {activeVehicle.license_plate}
              </div>
            </div>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold leading-tight">
                    {[activeVehicle.make, activeVehicle.model_name].filter(Boolean).join(' ')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {activeVehicle.year ? `${activeVehicle.year} · ` : ''}
                    {activeVehicle.fleet_group ?? (activeVehicle.vehicle_type === 'bike' ? 'Moto' : 'Voiture')}
                  </p>
                </div>
                <Badge variant="outline" className="whitespace-nowrap">
                  {activeRental?.status === 'active' ? 'Location active' : activeRental?.status ?? 'Assigné'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Tarif journalier</p>
                  <p className="font-semibold">{formatCurrency(Number(activeVehicle.rent_per_day ?? 0))}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Depuis</p>
                  <p className="font-semibold">{activeRental?.start_date ? formatDateShort(activeRental.start_date) : '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <VehicleStatusCard status={vehicleOpsStatus} />

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Résumé location</p>
                  <h3 className="font-bold">Compte véhicule</h3>
                </div>
                <Link to="/driver/finance">
                  <Button variant="outline" size="sm">
                    Voir les paiements
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-3">
                  <Wallet className="h-4 w-4 text-primary mb-1" />
                  <p className="text-xs text-muted-foreground">Solde actuel</p>
                  <p className="font-bold">{formatCurrency(currentBalance)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <Clock className="h-4 w-4 text-primary mb-1" />
                  <p className="text-xs text-muted-foreground">Prochaine échéance</p>
                  <p className="font-bold">{nextPayment?.due_date ? nextDueDateLabel(nextPayment.due_date) : 'Aucune'}</p>
                  {nextPayment?.due_date && (
                    <p className="text-[11px] text-muted-foreground">{formatDateShort(nextPayment.due_date)}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents véhicule</p>
                  <h3 className="font-bold">Validité et contrôle</h3>
                </div>
                <Link to="/driver/fleet-control">
                  <Button variant="ghost" size="sm">
                    Contrôle
                    <ClipboardCheck className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
              {activeInspection && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {FLEET_CONTROL_STATUS_LABEL[activeInspection.effective_status]}
                    </span>
                    <span className="font-medium">{inspectionDocs.length}/{DOCUMENT_ZONES.length} documents</span>
                  </div>
                  <Progress value={Math.round((inspectionDocs.length / DOCUMENT_ZONES.length) * 100)} className="h-2" />
                </div>
              )}
              <div className="space-y-2">
                {DOCUMENT_ZONES.map((doc) => {
                  const item = inspectionDocs.find((row) => row.zone === doc.key);
                  const status = deriveDriverDocumentStatus(
                    item?.validation_status === 'approved'
                      ? 'approved'
                      : item?.validation_status === 'rejected'
                      ? 'rejected'
                      : item
                      ? 'pending'
                      : null,
                  );
                  return (
                    <div key={doc.key} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.label}</p>
                          {item?.rejection_reason && (
                            <p className="text-xs text-destructive truncate">{item.rejection_reason}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant={status === 'approved' ? 'success' : status === 'rejected' || status === 'expired' ? 'destructive' : 'outline'} className="text-[10px]">
                        {DRIVER_DOCUMENT_STATUS_LABEL[status]}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historique véhicule</p>
                  <h3 className="font-bold">Événements récents</h3>
                </div>
                <Button size="sm" onClick={() => setIsReportOpen(true)}>
                  <Wrench className="h-4 w-4 mr-1" />
                  Signaler
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-full bg-primary/10 p-2">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Véhicule assigné</p>
                    <p className="text-xs text-muted-foreground">
                      {activeRental?.start_date ? formatDateShort(activeRental.start_date) : 'Date non disponible'}
                    </p>
                  </div>
                </div>

                {activeInspection && (
                  <div className="flex gap-3">
                    <div className="mt-0.5 rounded-full bg-muted p-2">
                      <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Contrôle véhicule</p>
                      <p className="text-xs text-muted-foreground">
                        {FLEET_CONTROL_STATUS_LABEL[activeInspection.effective_status]} · échéance {formatDateShort(activeInspection.due_at)}
                      </p>
                    </div>
                  </div>
                )}

                {[...vehicleReports, ...maintenanceOrders].slice(0, 4).map((event: any) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="mt-0.5 rounded-full bg-muted p-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {event.category
                          ? PROBLEM_CATEGORIES.find((item) => item.value === event.category)?.label ?? event.category
                          : event.order_type ?? 'Maintenance'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {MAINTENANCE_STATUS_LABEL[event.status] ?? event.status} · {formatRelativeTime(event.created_at)}
                      </p>
                    </div>
                  </div>
                ))}

                {vehicleReports.length === 0 && maintenanceOrders.length === 0 && (
                  <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    Aucun signalement récent.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

	      {/* Active/Pending Rental Notice */}
	      {driverId && hasPendingRental && !hasActiveRental && (
	        <div className="px-4 mb-4">
	          <Link to="/driver/rental">
	            <Card className="border-secondary/50 bg-secondary/5 cursor-pointer hover:shadow-md transition-shadow">
	              <CardContent className="p-4 flex items-center gap-3">
	                <CheckCircle className="h-5 w-5 text-secondary" />
	                <div className="flex-1">
	                  <p className="font-medium text-sm">
	                    Demande en cours
	                  </p>
	                  <p className="text-xs text-muted-foreground">
	                    Votre demande est en cours de traitement. Appuyez pour voir.
	                  </p>
	                </div>
	                <Badge variant="pending" className="ml-auto">En attente</Badge>
	              </CardContent>
	            </Card>
	          </Link>
	        </div>
	      )}

	      <div className="px-4 mb-3">
	        <div className="flex items-center gap-2">
	          <Gauge className="h-4 w-4 text-primary" />
	          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
	            Catalogue
	          </h2>
	        </div>
	      </div>

      {/* Search Bar */}
      <div className="px-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Rechercher par nom ou plaque..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
            maxLength={50}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter and Sort Controls */}
      <div className="px-4 mb-4 flex gap-2">
        {/* Fleet category filter (KIRA: VTC / WARREN / CARGO / N'LOOTTO) */}
        <div className="flex bg-muted rounded-lg p-1 flex-1 overflow-x-auto">
          <button
            onClick={() => setTypeFilter('all')}
            className={cn(
              'flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
              typeFilter === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Tous
          </button>
          {FLEET_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setTypeFilter(c.value)}
              className={cn(
                'flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
                typeFilter === c.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Filter Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="relative flex-shrink-0">
              <SlidersHorizontal className="h-4 w-4" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-background">
            <DropdownMenuLabel>Disponibilité</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setStatusFilter('all')} className="flex items-center justify-between">
              Toutes
              {statusFilter === 'all' && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('available')} className="flex items-center justify-between">
              Disponibles
              {statusFilter === 'available' && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('rented')} className="flex items-center justify-between">
              Loués
              {statusFilter === 'rented' && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('maintenance')} className="flex items-center justify-between">
              En maintenance
              {statusFilter === 'maintenance' && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="flex-shrink-0">
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-background">
            <DropdownMenuLabel>Trier par</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSortBy('availability')} className="flex items-center justify-between">
              Disponibilité
              {sortBy === 'availability' && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name')} className="flex items-center justify-between">
              Nom
              {sortBy === 'name' && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('price-asc')} className="flex items-center justify-between">
              Prix croissant
              {sortBy === 'price-asc' && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('price-desc')} className="flex items-center justify-between">
              Prix décroissant
              {sortBy === 'price-desc' && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Results count */}
      <div className="px-4 mb-3">
        <p className="text-sm text-muted-foreground">
          {filteredAndSortedVehicles.length} véhicule{filteredAndSortedVehicles.length !== 1 ? 's' : ''} trouvé{filteredAndSortedVehicles.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="px-4 pb-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredAndSortedVehicles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{UI.NO_DATA}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredAndSortedVehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onSelect={handleSelectVehicle}
                isFavorite={favorites.includes(vehicle.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rental Request Dialog */}
	      <RentalRequestDialog
	        vehicle={selectedVehicle}
	        isOpen={!!selectedVehicle}
	        onClose={() => setSelectedVehicle(null)}
	        hasActiveRental={hasActiveRental}
	        hasPendingRental={hasPendingRental}
	        kycStatus={driverProfile?.kyc_status || 'pending'}
	      />
	      <ReportProblemDialog
	        isOpen={isReportOpen}
	        onClose={() => setIsReportOpen(false)}
	        vehicle={activeVehicle}
	        driverId={driverId}
	        customerId={driverProfile?.customer_id}
	        onSubmitted={() => {
	          queryClient.invalidateQueries({ queryKey: ['driver-vehicle-reports', driverId, activeVehicle?.id] });
	          queryClient.invalidateQueries({ queryKey: ['driverSupportTickets'] });
	        }}
	      />
	      </KycGate>
	    </DriverLayout>
	  );
	}
