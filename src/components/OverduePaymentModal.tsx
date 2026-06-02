import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, CreditCard, Clock, Smartphone, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { format, parseISO, differenceInDays, addHours, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { useDriverRentals } from '@/hooks/useDriverData';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { enqueuePayment } from '@/lib/paymentQueue';

const DISMISSED_KEY = 'overdue_payment_dismissed';
const DISMISS_UNTIL_KEY = 'overdue_payment_dismiss_until';

export function OverduePaymentModal() {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const { data: rentals = [] } = useDriverRentals();

  // Find active rental
  const activeRental = rentals.find((r: any) => r.status === 'active');

  // Fetch overdue payments
  const { data: overduePayments = [] } = useQuery({
    queryKey: ['overduePayments', activeRental?.id],
    queryFn: async () => {
      if (!activeRental?.id) return [];
      
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('rental_id', activeRental.id)
        .eq('status', 'pending')
        .lt('due_date', today)
        .order('due_date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRental?.id,
  });

  const hasOverduePayments = overduePayments.length > 0;

  // Calculate total overdue amount
  const totalOverdue = overduePayments.reduce((sum: number, p: any) => sum + p.amount, 0);
  
  // Get oldest overdue payment
  const oldestOverdue = overduePayments[0];
  const daysOverdue = oldestOverdue 
    ? differenceInDays(new Date(), parseISO(oldestOverdue.due_date))
    : 0;

  // Generate payment reference
  const paymentReference = oldestOverdue 
    ? `LOC-${activeRental?.id?.slice(0, 8)}-${oldestOverdue.id?.slice(0, 8)}`
    : '';

  // Check if modal was recently dismissed
  useEffect(() => {
    if (!hasOverduePayments) {
      setIsVisible(false);
      return;
    }

    // Check dismiss until time
    const dismissUntil = localStorage.getItem(DISMISS_UNTIL_KEY);
    if (dismissUntil) {
      const dismissTime = parseInt(dismissUntil, 10);
      if (Date.now() < dismissTime) {
        setIsVisible(false);
        return;
      }
    }

    // Show modal after a short delay for better UX
    const timer = setTimeout(() => setIsVisible(true), 500);
    return () => clearTimeout(timer);
  }, [hasOverduePayments]);

  const handleSnooze = (duration: 'hour' | 'today' | 'tomorrow') => {
    let dismissUntil: Date;
    
    switch (duration) {
      case 'hour':
        dismissUntil = addHours(new Date(), 1);
        break;
      case 'today':
        dismissUntil = endOfDay(new Date());
        break;
      case 'tomorrow':
        dismissUntil = addHours(endOfDay(new Date()), 12); // Noon tomorrow
        break;
      default:
        dismissUntil = addHours(new Date(), 4);
    }
    
    localStorage.setItem(DISMISS_UNTIL_KEY, dismissUntil.getTime().toString());
    setIsVisible(false);
  };

  const [isPayLoading, setIsPayLoading] = useState(false);

  const handlePayNow = async () => {
    if (!oldestOverdue) return;
    const successUrl = `${window.location.origin}/driver/rental?payment=success`;
    const errorUrl = `${window.location.origin}/driver/rental?payment=error`;

    // Offline-first: queue the intent and dismiss the modal — the global
    // PaymentQueueBanner will resurface it the moment we're back online.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueuePayment({
        paymentId: oldestOverdue.id,
        amount: totalOverdue,
        successUrl,
        errorUrl,
      });
      toast.success('Paiement mis en file d\'attente', {
        description:
          'Pas de connexion. Nous finaliserons votre paiement Wave dès le retour du réseau.',
      });
      setIsVisible(false);
      return;
    }

    setIsPayLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('wave-checkout', {
        body: {
          paymentId: oldestOverdue.id,
          amount: totalOverdue,
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
      const isNetworkError =
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('network');
      if (isNetworkError) {
        enqueuePayment({
          paymentId: oldestOverdue.id,
          amount: totalOverdue,
          successUrl,
          errorUrl,
        });
        toast.warning('Connexion instable', {
          description:
            'Paiement en file d\'attente. Nous réessaierons automatiquement.',
        });
        setIsVisible(false);
      } else {
        toast.error('Erreur de paiement', {
          description: `Impossible de créer la session Wave. ${msg}`,
        });
      }
    } finally {
      setIsPayLoading(false);
    }
  };

  const handleViewDetails = () => {
    setIsVisible(false);
    navigate('/driver/rental');
  };

  if (!hasOverduePayments) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="w-full max-w-md relative"
          >
            {/* Close button */}
            <button
              onClick={() => handleSnooze('hour')}
              className="absolute -top-2 -right-2 p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors z-10"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Warning icon with pulse animation */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-destructive/20 rounded-full animate-ping" />
                <div className="relative bg-destructive/10 p-6 rounded-full">
                  <AlertTriangle className="h-16 w-16 text-destructive" />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="text-center space-y-4">
              <h1 className="text-2xl font-bold text-destructive">
                Paiement en retard
              </h1>
              
              <p className="text-muted-foreground">
                Vous avez {overduePayments.length} paiement{overduePayments.length > 1 ? 's' : ''} en retard
                {daysOverdue > 0 && (
                  <span className="block mt-1 text-destructive font-medium">
                    depuis {daysOverdue} jour{daysOverdue > 1 ? 's' : ''}
                  </span>
                )}
              </p>

              {/* Amount card */}
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-6 mt-6">
                <p className="text-sm text-muted-foreground mb-2">Montant total dû</p>
                <p className="text-4xl font-bold text-destructive">
                  {formatCurrency(totalOverdue)}
                </p>
                {oldestOverdue && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Échéance: {format(parseISO(oldestOverdue.due_date), 'd MMMM yyyy', { locale: fr })}
                  </p>
                )}
              </div>

              {/* Vehicle info */}
              {activeRental?.vehicle && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <CreditCard className="h-4 w-4" />
                  <span>{activeRental.vehicle.model_name}</span>
                </div>
              )}

              {/* Warning message */}
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mt-4">
                <p className="text-sm font-medium text-destructive">
                  <Clock className="h-4 w-4 inline mr-2" />
                  Les retards de paiement peuvent affecter votre score et votre accès aux véhicules.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3 mt-6">
                {/* Wave Payment Button */}
                <Button
                  size="lg"
                  className="w-full bg-[#1DC3E4] hover:bg-[#1DC3E4]/90 text-white"
                  onClick={handlePayNow}
                  disabled={isPayLoading}
                >
                  {isPayLoading ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Smartphone className="h-5 w-5 mr-2" />
                  )}
                  {isPayLoading ? 'Chargement...' : 'Payer avec Wave'}
                  {!isPayLoading && <ExternalLink className="h-4 w-4 ml-2" />}
                </Button>

                {/* View details button */}
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/5"
                  onClick={handleViewDetails}
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  Voir les détails
                </Button>
                
                {/* Snooze buttons */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center">Me rappeler plus tard</p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-muted-foreground text-xs"
                      onClick={() => handleSnooze('hour')}
                    >
                      1 heure
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-muted-foreground text-xs"
                      onClick={() => handleSnooze('today')}
                    >
                      Fin de journée
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-muted-foreground text-xs"
                      onClick={() => handleSnooze('tomorrow')}
                    >
                      Demain
                    </Button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                Réf: {paymentReference}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}