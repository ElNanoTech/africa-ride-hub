import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { VehicleCard } from '@/components/VehicleCard';
import { resolveVehicleImage } from '@/lib/vehicleImages';
import { supabase } from '@/integrations/supabase/routeClient';
import { NAV, UI, RENTAL } from '@/lib/i18n';
import { KycGate } from '@/components/KycGate';
import { formatCurrency } from '@/lib/format';
import { useDriverId, useDriverRentals, useDriverFavorites, useToggleFavorite } from '@/hooks/useDriverData';
import { useDriverFullProfile } from '@/hooks/useDriverProfile';
import { useVehiclesRealtime } from '@/hooks/useDriverRealtimeSubscription';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HapticButton } from '@/components/HapticButton';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Car, Bike, Calendar, AlertCircle, CheckCircle, SlidersHorizontal, ArrowUpDown, Check, Search, X, ShieldAlert } from 'lucide-react';
import { FLEET_CATEGORIES, type FleetCategory } from '@/lib/fleetCategories';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Vehicle {
  id: string;
  model_name: string;
  license_plate: string;
  vehicle_type: 'car' | 'bike';
  fleet_group?: string | null;
  rent_per_day: number;
  status: 'available' | 'rented' | 'maintenance';
  image_url?: string | null;
}

type SortOption = 'name' | 'price-asc' | 'price-desc' | 'availability';
type StatusFilter = 'all' | 'available' | 'rented' | 'maintenance';
type TypeFilter = 'all' | FleetCategory;

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

export default function Vehicles() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('availability');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const { data: driverId } = useDriverId();
  const { data: rentals = [] } = useDriverRentals();
  const { data: favorites = [] } = useDriverFavorites();
  const toggleFavorite = useToggleFavorite();
  const { data: driverProfile } = useDriverFullProfile();

  // Live updates: vehicle status flips from "Disponible" → "Loué" the instant
  // an admin approves a rental, without the driver having to refresh.
  useVehiclesRealtime();

  // Check if driver has active or pending rentals
  const hasActiveRental = rentals.some((r: any) => r.status === 'active');
  const hasPendingRental = rentals.some((r: any) => r.status === 'pending');

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
      case 'availability':
        const statusOrder = { available: 0, rented: 1, maintenance: 2 };
        result.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
        break;
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
      <DriverBreadcrumb items={[{ label: NAV.VEHICLES }]} />
      <PageHeader title={NAV.VEHICLES} />
      <KycGate>
      
      {/* Active/Pending Rental Notice */}
      {driverId && (hasActiveRental || hasPendingRental) && (
        <div className="px-4 mb-4">
          <Link to="/driver/rental">
            <Card className={`${hasActiveRental ? 'border-primary/50 bg-primary/5' : 'border-secondary/50 bg-secondary/5'} cursor-pointer hover:shadow-md transition-shadow`}>
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle className={`h-5 w-5 ${hasActiveRental ? 'text-primary' : 'text-secondary'}`} />
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {hasActiveRental ? 'Location active' : 'Demande en cours'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {hasActiveRental 
                      ? 'Appuyez pour voir les détails de votre location'
                      : 'Votre demande est en cours de traitement. Appuyez pour voir.'}
                  </p>
                </div>
                {hasActiveRental && (
                  <Badge variant="active" className="ml-auto">Active</Badge>
                )}
                {hasPendingRental && !hasActiveRental && (
                  <Badge variant="pending" className="ml-auto">En attente</Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

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
      </KycGate>
    </DriverLayout>
  );
}
