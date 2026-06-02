import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveVehicleImage } from '@/lib/vehicleImages';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { KycGate } from '@/components/KycGate';
import { PaymentReceipt } from '@/components/PaymentReceipt';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDateShort, daysBetween } from '@/lib/format';
import { NAV, RENTAL, UI } from '@/lib/i18n';
import { Car, MapPin, Fuel, Gauge, Route, AlertTriangle, Calendar, AlertCircle, Clock, CheckCircle, XCircle, Smartphone, ExternalLink, Wallet } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';
import { StatusBadge } from '@/lib/statusBadges';
import { enqueuePayment, isQueued } from '@/lib/paymentQueue';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useDriverRentals, useDriverPayments, useDriverId, useDriverTelemetry } from '@/hooks/useDriverData';
import { useRentalsRealtime } from '@/hooks/useDriverRealtimeSubscription';

const ACTIVE_DRIVER_RENTAL_STATUSES = ['active', 'return_pending', 'overdue_return', 'payment_overdue'] as const;
const isActiveDriverRentalStatus = (s: string) =>
  (ACTIVE_DRIVER_RENTAL_STATUSES as readonly string[]).includes(s);


interface Rental {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  vehicle?: {
    id: string;
    model_name: string;
    license_plate: string;
    image_url: string | null;
  };
}

interface Payment {
  id: string;
  amount: number;
  amount_paid?: number | null;
  due_date: string;
  status: string;
  rental_id: string | null;
  paid_date?: string | null;
  payment_type?: string;
  wave_transaction_id?: string | null;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="pending" className="whitespace-nowrap min-w-fit px-2"><Clock className="h-3 w-3 mr-1" />En attente</Badge>;
    case 'active':
      return <Badge variant="active"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
    case 'return_pending':
      return <Badge variant="pending" className="whitespace-nowrap min-w-fit px-2"><Clock className="h-3 w-3 mr-1" />Retour demandé</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Refusée</Badge>;
    case 'completed':
      return <Badge variant="verified">Terminée</Badge>;
    case 'cancelled':
      return <Badge variant="outline">Annulée</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function LoadingSkeleton() {
  return (
    <>
      <div className="px-4 mb-6">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <div className="px-4 mb-6">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </>
  );
}

function NoDriverProfileAlert() {
  return (
    <Card className="border-warning/50 bg-warning/5 mx-4">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-warning/20 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">Profil conducteur requis</h3>
            <p className="text-sm text-muted-foreground">
              Vous devez compléter votre inscription pour accéder aux locations.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="px-4 flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-32 h-32 bg-muted rounded-full flex items-center justify-center mb-6">
        <Car className="h-16 w-16 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">{RENTAL.NO_ACTIVE}</h2>
      <p className="text-muted-foreground text-center mb-6 max-w-xs">
        Parcourez notre catalogue de véhicules et demandez une location.
      </p>
      <Link to="/driver/vehicles">
        <Button variant="hero" size="lg">
          {RENTAL.RENT_VEHICLE}
        </Button>
      </Link>
    </div>
  );
}

interface Telemetry {
  distance_km: number;
  average_speed_kmh: number | null;
  fuel_level: number | null;
  last_location_lat: number | null;
  last_location_lng: number | null;
}

function PaymentRow({ payment, vehicleName }: { payment: Payment; vehicleName?: string }) {
  const [isPayLoading, setIsPayLoading] = useState(false);
  const [queued, setQueued] = useState(() => isQueued(payment.id));

  const handlePayWithWave = async () => {
    const successUrl = `${window.location.origin}/driver/rental?payment=success`;
    const errorUrl = `${window.location.origin}/driver/rental?payment=error`;

    // Offline-first: if we have no network, queue the intent locally and let
    // usePaymentQueue flush it the moment we're back online.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueuePayment({
        paymentId: payment.id,
        amount: payment.amount,
        successUrl,
        errorUrl,
      });
      setQueued(true);
      toast.success('Paiement mis en file d\'attente', {
        description:
          'Pas de connexion. Nous finaliserons votre paiement Wave dès le retour du réseau.',
      });
      return;
    }

    setIsPayLoading(true);
    try {
      const response = await supabase.functions.invoke('wave-checkout', {
        body: {
          paymentId: payment.id,
          amount: payment.amount,
          successUrl,
          errorUrl,
        },
      });

      if (response.error) throw new Error(response.error.message);
      
      const result = response.data;
      if (result?.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error('Wave checkout error:', err);
      // Network-style failures get queued automatically so the driver isn't
      // forced to retry manually after every flaky 3G hiccup.
      const isNetworkError =
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('network');
      if (isNetworkError) {
        enqueuePayment({
          paymentId: payment.id,
          amount: payment.amount,
          successUrl,
          errorUrl,
        });
        setQueued(true);
        toast.warning('Connexion instable', {
          description:
            'Votre paiement est en file d\'attente. Nous réessaierons automatiquement.',
        });
      } else {
        toast.error('Erreur de paiement', {
          description: `Impossible de créer la session Wave. ${msg}`,
        });
      }
    } finally {
      setIsPayLoading(false);
    }
  };

  const isPaidLike = payment.status === 'paid' || payment.status === 'overpaid';
  const isPendingOrOverdue =
    payment.status === 'pending' ||
    payment.status === 'overdue' ||
    payment.status === 'partial';
  const remaining = Math.max(
    0,
    Number(payment.amount ?? 0) - Number(payment.amount_paid ?? 0),
  );

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{formatCurrency(payment.amount)}</p>
          <p className="text-sm text-muted-foreground">
            Échéance: {formatDateShort(new Date(payment.due_date))}
          </p>
          {payment.status === 'partial' && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Reçu: {formatCurrency(payment.amount_paid ?? 0)} • Reste: {formatCurrency(remaining)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge kind="payment" status={payment.status} />
        </div>
      </div>
      {isPendingOrOverdue && (
        <div className="mt-3">
          <Button 
            variant="default" 
            size="sm" 
            className="w-full"
            onClick={handlePayWithWave}
            disabled={isPayLoading}
          >
            {isPayLoading ? (
              'Chargement...'
            ) : queued ? (
              <>
                <Clock className="h-4 w-4 mr-2" />
                En attente de connexion
              </>
            ) : (
              <>
                <Smartphone className="h-4 w-4 mr-2" />
                {payment.status === 'partial'
                  ? `Payer le solde (${formatCurrency(remaining)})`
                  : 'Payer avec Wave'}
                <ExternalLink className="h-3 w-3 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}
      {isPaidLike && (
        <div className="mt-2 flex justify-end">
          <PaymentReceipt
            payment={payment}
            driverName=""
            vehicleInfo={vehicleName}
            compact
          />
        </div>
      )}
    </div>
  );
}

function DriverWalletTile() {
  const { data: driverId } = useDriverId();
  const { data } = useQuery({
    queryKey: ['driver-wallet-self', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_wallets')
        .select('balance')
        .eq('driver_id', driverId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const balance = data?.balance ?? 0;
  if (balance <= 0) return null;
  return (
    <div className="px-4 mb-6">
      <Card className="bg-success/5 border-success/30">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Solde DAM disponible</p>
            <p className="text-lg font-bold">{formatCurrency(balance)}</p>
          </div>
          <Badge variant="verified">Auto-appliqué</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

function ActiveRentalView({ rental, payments, telemetry }: { rental: Rental; payments: Payment[]; telemetry: Telemetry | null }) {
  const requestReturn = useRequestReturn();
  const isReturnRequested = rental.status === 'return_pending';
  const rentalPayments = payments.filter(p => p.rental_id === rental.id);
  const daysRemaining = rental.end_date ? daysBetween(new Date(), new Date(rental.end_date)) : 0;

  // Use real telemetry or show defaults
  const displayTelemetry = {
    distance_today: telemetry?.distance_km || 0,
    average_speed: telemetry?.average_speed_kmh || 0,
    fuel_level: telemetry?.fuel_level || 0,
    last_location: { 
      lat: telemetry?.last_location_lat || 5.3599, 
      lng: telemetry?.last_location_lng || -4.0082 
    },
  };

  return (
    <>
      {(rental.status === 'overdue_return' || rental.status === 'payment_overdue') && (
        <div className="px-4 mb-3">
          <Card className="border-warning/40 bg-warning/10">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">
                Retour en retard. Une nouvelle facture est émise chaque jour. Payez vos factures du jour ci-dessous.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Vehicle Info */}
      <div className="px-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-20 h-20 bg-muted rounded-xl flex items-center justify-center">
                {(() => {
                  const resolved = resolveVehicleImage(rental.vehicle?.image_url, rental.vehicle?.model_name);
                  return resolved ? (
                    <img
                      src={resolved}
                      alt={rental.vehicle?.model_name}
                      className="w-full h-full object-cover rounded-xl"
                    />
                  ) : (
                    <Car className="h-10 w-10 text-muted-foreground" />
                  );
                })()}
              </div>
              <div>
                <h2 className="text-xl font-bold">{rental.vehicle?.model_name || 'Véhicule'}</h2>
                <p className="text-muted-foreground">{rental.vehicle?.license_plate}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {formatDateShort(new Date(rental.start_date))}
                  {rental.end_date && ` - ${formatDateShort(new Date(rental.end_date))}`}
                </span>
              </div>
              {daysRemaining > 0 && (
                <Badge variant="verified">
                  {daysRemaining} jours restants
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Tracking Map Placeholder */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Localisation en temps réel
        </h2>
        <Card className="overflow-hidden">
          <div className="aspect-video bg-muted flex items-center justify-center relative">
            <div className="text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Carte GPS</p>
              <p className="text-xs text-muted-foreground">
                Lat: {displayTelemetry.last_location.lat.toFixed(4)}, 
                Lng: {displayTelemetry.last_location.lng.toFixed(4)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Telemetry Stats */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Statistiques du jour
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Route className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{displayTelemetry.distance_today.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">km</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Gauge className="h-6 w-6 text-secondary mx-auto mb-2" />
              <p className="text-2xl font-bold">{displayTelemetry.average_speed.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">km/h</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Fuel className="h-6 w-6 text-warning mx-auto mb-2" />
              <p className="text-2xl font-bold">{displayTelemetry.fuel_level}%</p>
              <p className="text-xs text-muted-foreground">carburant</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Driver wallet tile */}
      <DriverWalletTile />

      {/* Payment Schedule */}
      {rentalPayments.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Échéancier de paiement
          </h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {rentalPayments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} vehicleName={rental.vehicle?.model_name} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Report Issue Button */}
      <div className="px-4 mb-4">
        <Link to="/driver/support">
          <Button variant="outline" className="w-full" size="lg">
            <AlertTriangle className="h-5 w-5 mr-2 text-warning" />
            {RENTAL.REPORT_ISSUE}
          </Button>
        </Link>
      </div>

      {/* Request return (admin must confirm) */}
      <div className="px-4 mb-6">
        {isReturnRequested ? (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Retour demandé</p>
                <p className="text-muted-foreground">
                  Un administrateur doit confirmer le retour du véhicule.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full" size="lg">
                <CheckCircle className="h-5 w-5 mr-2 text-primary" />
                Demander le retour du véhicule
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Demander le retour ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette demande sera envoyée à l'administrateur. Il devra confirmer le retour du véhicule pour clôturer la location.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => requestReturn.mutate(rental.id)}
                  disabled={requestReturn.isPending}
                >
                  Envoyer la demande
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </>
  );
}

function useCancelRental() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rentalId: string) => {
      const { error } = await supabase
        .from('rentals')
        .update({ status: 'cancelled' })
        .eq('id', rentalId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverRentals'] });
      toast.success('Demande de location annulée.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'annulation');
    },
  });
}

function useRequestReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rentalId: string) => {
      const { error } = await supabase
        .from('rentals')
        .update({ status: 'return_pending' })
        .eq('id', rentalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverRentals'] });
      toast.success('Demande envoyée', {
        description: "L'admin doit confirmer le retour du véhicule.",
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la demande de retour');
    },
  });
}

function PendingRentalsSection({ rentals }: { rentals: Rental[] }) {
  const cancelRental = useCancelRental();

  if (rentals.length === 0) return null;

  return (
    <div className="px-4 mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        Demandes en attente
      </h2>
      <div className="space-y-3">
        {rentals.map((rental) => (
          <Card key={rental.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Car className="h-5 w-5 text-primary" />
                  <span className="font-medium">{rental.vehicle?.model_name || 'Véhicule'}</span>
                </div>
                {getStatusBadge(rental.status)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Location à la journée
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Demandé le {formatDateShort(new Date(rental.start_date))}
              </p>
              <div className="mt-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={cancelRental.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Annuler la demande
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Annuler cette demande ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Votre demande de location pour {rental.vehicle?.model_name || 'ce véhicule'} sera annulée. Vous pourrez en faire une nouvelle à tout moment.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Non, garder</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelRental.mutate(rental.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Oui, annuler
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RentalHistorySection({ rentals }: { rentals: Rental[] }) {
  if (rentals.length === 0) return null;

  return (
    <div className="px-4 mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        Historique
      </h2>
      <div className="space-y-3">
        {rentals.map((rental) => (
          <Card key={rental.id} className="opacity-75">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Car className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{rental.vehicle?.model_name || 'Véhicule'}</span>
                </div>
                {getStatusBadge(rental.status)}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDateShort(new Date(rental.start_date))}
                {rental.end_date && ` - ${formatDateShort(new Date(rental.end_date))}`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Rental() {
  const { data: driverId, isLoading: isDriverIdLoading, isSuccess: isDriverIdSuccess } = useDriverId();
  const { data: rentals = [], isLoading: isRentalsLoading } = useDriverRentals();
  const { data: payments = [], isLoading: isPaymentsLoading } = useDriverPayments();
  const { data: telemetry } = useDriverTelemetry();

  // Enable real-time updates
  useRentalsRealtime();

  const isLoading = isDriverIdLoading || isRentalsLoading || isPaymentsLoading;
  const hasDriverProfile = !!driverId;

  // Categorize rentals
  const activeRental = (rentals as Rental[]).find(r => isActiveDriverRentalStatus(r.status));
  const pendingRentals = (rentals as Rental[]).filter(r => r.status === 'pending');
  const historyRentals = (rentals as Rental[]).filter(r =>
    ['completed', 'cancelled', 'rejected'].includes(r.status)
  );

  // Notify the driver when the admin confirms a return: we watch the status of
  // the most recently observed in-flight rental and toast when it flips to
  // 'completed'. Tracked by id so we only fire once per rental.
  const watchedRentalRef = useRef<{ id: string; status: string; vehicleId?: string } | null>(null);
  const notifiedReturnRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const inFlight = (rentals as Rental[]).find(r => isActiveDriverRentalStatus(r.status));
    const prev = watchedRentalRef.current;
    if (prev && !notifiedReturnRef.current.has(prev.id)) {
      const justCompleted = (rentals as Rental[]).find(
        r => r.id === prev.id && r.status === 'completed'
      );
      if (justCompleted) {
        notifiedReturnRef.current.add(prev.id);
        const vehicleId = prev.vehicleId ?? justCompleted.vehicle?.id;
        // Verify the vehicle is back to available before celebrating; the trigger
        // syncs vehicle.status when rental flips to completed, but a quick check
        // catches edge cases (other active rental, manual override).
        (async () => {
          let vehicleAvailable = true;
          if (vehicleId) {
            const { data } = await supabase
              .from('vehicles')
              .select('status')
              .eq('id', vehicleId)
              .maybeSingle();
            vehicleAvailable = !data || data.status === 'available';
          }
          toast.success('Retour confirmé', {
            description: vehicleAvailable
              ? "L'administrateur a clôturé votre location. Le véhicule est de nouveau disponible."
              : "L'administrateur a clôturé votre location.",
            duration: 6000,
          });
        })();
      }
    }
    watchedRentalRef.current = inFlight
      ? { id: inFlight.id, status: inFlight.status, vehicleId: inFlight.vehicle?.id }
      : null;
  }, [rentals]);

  if (isDriverIdSuccess && driverId === null) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: NAV.RENTAL }]} />
        <PageHeader title={NAV.RENTAL} />
        <NoDriverProfileAlert />
      </DriverLayout>
    );
  }

  if (isLoading) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: NAV.RENTAL }]} />
        <PageHeader title={NAV.RENTAL} />
        <LoadingSkeleton />
      </DriverLayout>
    );
  }

  // No rentals at all
  if (rentals.length === 0) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: NAV.RENTAL }]} />
        <PageHeader title={NAV.RENTAL} />
        <EmptyState />
      </DriverLayout>
    );
  }

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: NAV.RENTAL }]} />
      <PageHeader 
        title={NAV.RENTAL}
        action={activeRental ? getStatusBadge(activeRental.status) : undefined}
      />
      <KycGate>

      {/* Active Rental */}
      {activeRental && (
        <ActiveRentalView rental={activeRental} payments={payments as Payment[]} telemetry={telemetry || null} />
      )}

      {/* No active but show browse option */}
      {!activeRental && (
        <div className="px-4 mb-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6 text-center">
              <Car className="h-12 w-12 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Aucune location active</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Parcourez notre catalogue pour louer un véhicule.
              </p>
              <Link to="/driver/vehicles">
                <Button>{RENTAL.RENT_VEHICLE}</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending Rentals */}
      <PendingRentalsSection rentals={pendingRentals} />

      {/* Rental History */}
      </KycGate>
    </DriverLayout>
  );
}
