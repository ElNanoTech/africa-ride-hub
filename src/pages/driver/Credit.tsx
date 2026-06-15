import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Bike,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  Lock,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Trophy,
  Tv,
  Wallet,
  WifiOff,
} from 'lucide-react';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { KycGate } from '@/components/KycGate';
import { KiraVoiceButton } from '@/components/driver/KiraVoiceButton';
import { BadgeGrid } from '@/components/BadgeGrid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CREDIT_OFFERS,
  OWNERSHIP_SCORE_TARGET,
  SCORE_RANGE_MAX,
  SCORE_RANGE_MIN,
  TRUST_LEVELS,
  type CreditOffer,
  type PaymentLike,
  calculateOnTimeRate,
  calculateOwnershipProgress,
  calculateOwnershipSimulation,
  calculatePaymentStreak,
  getAvailableOffers,
  getEligibilityGaps,
  getLoanStatusDisplay,
  getNextUnlock,
  getScoreBand,
  getTrustLevelFromScore,
  isOfferEligible,
} from '@/lib/creditJourney';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverActiveInspection } from '@/hooks/useDriverActiveInspection';
import { useBadgesWithStatus, useBadgeChecker } from '@/hooks/useDriverBadges';
import { useDriverCurrentScore, useDriverCreditScores, useDriverId, useDriverLoans, useDriverPayments } from '@/hooks/useDriverData';
import { useDriverFullProfile } from '@/hooks/useDriverProfile';
import { useDailyStreak } from '@/hooks/useDailyStreak';
import { useLoansRealtime } from '@/hooks/useDriverRealtimeSubscription';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import {
  creditStatusLabel,
  offerTypeToProductType,
  useDriverCreditEngineData,
  useSubmitCreditApplication,
  type CreditProductRow,
  type CreditApplicationRow,
  type CreditAccountRow,
  type CreditInvoiceRow,
} from '@/hooks/useCreditProductEngineData';
import suzukiAlto from '@/assets/vehicles/suzuki-alto.png';

type CoachTopic = 'car' | 'score' | 'next';

type ScoreEvent = {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
};

type DriverLoan = {
  id: string;
  loan_type: string;
  status: string | null;
  rejection_reason: string | null;
  applied_at: string;
  amount_requested: number | null;
};

type DriverCreditScoreSnapshot = {
  id: string;
  score: number;
  tier?: string | null;
  calculation_week: string;
  driving_data_available?: boolean | null;
  driving_impact?: number | null;
};

const offerIcons: Record<CreditOffer['type'], typeof Car> = {
  phone_loan: Smartphone,
  tv_loan: Tv,
  bike_loan: Bike,
  car_loan: Car,
};

const scoreToneClasses = {
  red: 'bg-red-500 text-white border-red-500',
  orange: 'bg-orange-500 text-white border-orange-500',
  blue: 'bg-blue-600 text-white border-blue-600',
  green: 'bg-emerald-600 text-white border-emerald-600',
};

const scoreTextClasses = {
  red: 'text-red-600',
  orange: 'text-orange-600',
  blue: 'text-blue-600',
  green: 'text-emerald-600',
};

const scoreTrackClasses = {
  red: 'from-red-500 to-orange-500',
  orange: 'from-orange-500 to-blue-500',
  blue: 'from-blue-600 to-emerald-500',
  green: 'from-emerald-500 to-emerald-700',
};

function useApplyForCredit() {
  return useSubmitCreditApplication();
}

function useScoreEvents(driverId?: string | null) {
  return useQuery({
    queryKey: ['driver-score-events-part4', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<ScoreEvent[]> => {
      const { data, error } = await supabase
        .from('driver_score_events')
        .select('id, delta, reason, created_at')
        .eq('driver_id', driverId!)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
  });
}

function LoadingSkeleton() {
  return (
    <DriverLayout>
      <PageHeader title="Crédit & Propriété" subtitle="Construisez votre avenir avec KIRA." />
      <div className="px-4 space-y-4">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </DriverLayout>
  );
}

function NoDriverProfileAlert() {
  return (
    <Card className="mx-4 border-warning/50 bg-warning/5">
      <CardContent className="p-5 flex items-start gap-3">
        <HelpCircle className="h-5 w-5 text-warning mt-0.5" />
        <div>
          <p className="font-semibold">Profil conducteur requis</p>
          <p className="text-sm text-muted-foreground mt-1">
            Votre profil doit être actif pour voir le parcours crédit et propriété.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreDashboard({
  score,
  trustLabel,
  scoreTone,
  scoreChange,
  voiceText,
}: {
  score: number;
  trustLabel: string;
  scoreTone: keyof typeof scoreToneClasses;
  scoreChange: number;
  voiceText: string;
}) {
  const rangeProgress = Math.max(0, Math.min(100, Math.round(((score - SCORE_RANGE_MIN) / (SCORE_RANGE_MAX - SCORE_RANGE_MIN)) * 100)));

  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/70">Score KIRA</p>
            <div className="mt-1 flex items-end gap-2">
              <p className="text-5xl font-bold tabular-nums leading-none">{score}</p>
              <Badge className={cn('mb-1 border', scoreToneClasses[scoreTone])}>{trustLabel}</Badge>
            </div>
            <p className="mt-2 text-xs text-white/70">Échelle {SCORE_RANGE_MIN} → {SCORE_RANGE_MAX}</p>
          </div>
          <KiraVoiceButton text={voiceText} compact className="border-white/30 bg-white/10 text-white hover:bg-white/20" />
        </div>

        <div className="mt-5">
          <div className="h-3 rounded-full bg-white/15 overflow-hidden">
            <div className={cn('h-full rounded-full bg-gradient-to-r transition-all', scoreTrackClasses[scoreTone])} style={{ width: `${rangeProgress}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-white/70">
            <span>500</span>
            <span>600</span>
            <span>700</span>
            <span>850</span>
            <span>1000</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-white/65">Cette semaine</p>
            <p className={cn('font-bold', scoreChange >= 0 ? 'text-emerald-200' : 'text-red-200')}>
              {scoreChange > 0 ? '+' : ''}{scoreChange} pts
            </p>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-white/65">Objectif propriété</p>
            <p className="font-bold">{OWNERSHIP_SCORE_TARGET} pts</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrustLevelsCard({ score }: { score: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Niveaux de confiance</CardTitle>
        <CardDescription>Votre niveau progresse avec votre score KIRA.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {[...TRUST_LEVELS].reverse().map((level) => {
          const active = level.label === 'Débutant'
            ? score < 600
            : score >= level.min && score <= level.max;
          return (
            <div key={level.label} className={cn('flex items-center justify-between rounded-lg border p-3', active && 'border-primary bg-primary/5')}>
              <div>
                <p className={cn('text-sm font-semibold', active && 'text-primary')}>{level.label}</p>
                <p className="text-xs text-muted-foreground">{level.min}-{level.max}</p>
              </div>
              {active ? <Badge variant="verified">Vous</Badge> : <span className="text-xs text-muted-foreground">{level.max < score ? 'Dépassé' : 'À atteindre'}</span>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OwnershipJourneyCard({
  score,
  weeksHistory,
  paymentRate,
  voiceText,
}: {
  score: number;
  weeksHistory: number;
  paymentRate: number;
  voiceText: string;
}) {
  const missingScore = Math.max(0, OWNERSHIP_SCORE_TARGET - score);
  const progress = calculateOwnershipProgress(score);
  const weeksRequired = 26;
  const missingWeeks = Math.max(0, weeksRequired - weeksHistory);

  return (
    <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-card to-blue-500/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Progression vers la propriété</p>
            <h2 className="mt-1 text-xl font-bold">De chauffeur à propriétaire</h2>
          </div>
          <KiraVoiceButton text={voiceText} compact />
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Score : <strong>{score}</strong></span>
            <span>Objectif : <strong>{OWNERSHIP_SCORE_TARGET}</strong></span>
          </div>
          <Progress value={progress} className="h-3" />
          <p className="text-sm font-semibold">
            {missingScore === 0 ? 'Score atteint.' : `${missingScore} points restants`}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-muted-foreground">Ancienneté</p>
            <p className="font-bold">{weeksHistory}/26 sem.</p>
            <p className="text-muted-foreground">Manque {missingWeeks}</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-muted-foreground">Paiements</p>
            <p className="font-bold">{paymentRate}%</p>
            <p className="text-muted-foreground">Min. 95%</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-muted-foreground">Chemin</p>
            <p className="font-bold">{progress}%</p>
            <p className="text-muted-foreground">vers 850</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EligibilityGapCard({
  score,
  weeksHistory,
  paymentRate,
  controlStatus,
  kycStatus,
}: {
  score: number;
  weeksHistory: number;
  paymentRate: number;
  controlStatus: string;
  kycStatus: string;
}) {
  const carOffer = CREDIT_OFFERS.find((offer) => offer.type === 'car_loan')!;
  const gaps = getEligibilityGaps(carOffer, { score, weeksHistory, onTimeRate: paymentRate });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pourquoi ?</CardTitle>
        <CardDescription>La décision doit toujours être expliquée.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Metric label="Score actuel" value={`${score}`} helper={`Minimum ${carOffer.requiredScore}`} missing={gaps.score ? `Il manque ${gaps.score} pts` : 'OK'} />
          <Metric label="Ancienneté" value={`${weeksHistory} semaines`} helper={`Minimum ${carOffer.requiredWeeks}`} missing={gaps.weeks ? `Manque ${gaps.weeks} sem.` : 'OK'} />
          <Metric label="Paiements à temps" value={`${paymentRate}%`} helper={`Minimum ${carOffer.requiredOnTimeRate}%`} missing={gaps.onTimeRate ? `Manque ${gaps.onTimeRate}%` : 'OK'} />
          <Metric label="Conformité" value={controlStatus} helper="KYC et contrôle" missing={kycStatus} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, helper, missing }: { label: string; value: string; helper: string; missing: string }) {
  const ok = missing === 'OK' || missing === 'Validé' || missing === 'À jour';
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{helper}</p>
      <p className={cn('mt-1 text-[11px] font-semibold', ok ? 'text-primary' : 'text-warning')}>{missing}</p>
    </div>
  );
}

function NextUnlockCard({ offer, score, weeksHistory, paymentRate }: { offer: CreditOffer | null; score: number; weeksHistory: number; paymentRate: number }) {
  if (!offer) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-semibold">Toutes les opportunités configurées sont ouvertes.</p>
            <p className="text-sm text-muted-foreground mt-1">Gardez vos paiements et contrôles à jour pour conserver cet accès.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const Icon = offerIcons[offer.type];
  const gaps = getEligibilityGaps(offer, { score, weeksHistory, onTimeRate: paymentRate });

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Prochaine opportunité</p>
            <h3 className="text-lg font-bold">{offer.title}</h3>
            <p className="text-sm text-muted-foreground">Requis : {offer.requiredScore} · Actuel : {score}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-background/70 border p-2">
            <p className="text-muted-foreground">Score</p>
            <p className="font-bold">{gaps.score} pts</p>
          </div>
          <div className="rounded-lg bg-background/70 border p-2">
            <p className="text-muted-foreground">Semaines</p>
            <p className="font-bold">{gaps.weeks}</p>
          </div>
          <div className="rounded-lg bg-background/70 border p-2">
            <p className="text-muted-foreground">Paiements</p>
            <p className="font-bold">{gaps.onTimeRate}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OfferCard({ offer, onView }: { offer: CreditOffer; onView: (offer: CreditOffer) => void }) {
  const Icon = offerIcons[offer.type];
  const image = offer.type === 'car_loan' ? suzukiAlto : null;

  return (
    <Card>
      <CardContent className="p-0 overflow-hidden">
        <div className="h-32 bg-gradient-to-br from-muted to-background flex items-center justify-center">
          {image ? (
            <img src={image} alt={offer.title} className="h-28 object-contain" />
          ) : (
            <div className="h-16 w-16 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">{offer.title}</h3>
              <p className="text-sm text-muted-foreground">{offer.category}</p>
            </div>
            <Badge variant="verified">Disponible</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <MetricMini label="Montant" value={formatCurrency(offer.amount)} />
            <MetricMini label="Paiement" value={`${formatCurrency(offer.dailyPayment)}/jour`} />
            <MetricMini label="Durée" value={`${offer.termMonths} mois`} />
            <MetricMini label="Score requis" value={`${offer.requiredScore}`} />
          </div>
          <Button className="mt-4 w-full min-h-11" onClick={() => onView(offer)}>
            Voir l'offre
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function OfferDialog({
  offer,
  product,
  existing,
  onClose,
}: {
  offer: CreditOffer | null;
  product: CreditProductRow | null;
  existing: boolean;
  onClose: () => void;
}) {
  const applyForCredit = useApplyForCredit();
  const { isOnline } = useOfflineStatus();

  if (!offer) return null;

  const handleSubmit = () => {
    if (existing || !isOnline || !product) return;
    applyForCredit.mutate({ productId: product.product_id }, { onSuccess: onClose });
  };

  return (
    <Dialog open={!!offer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{offer.title}</DialogTitle>
          <DialogDescription>Conditions, paiement, durée et engagement.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <InfoRow icon={FileText} label="Conditions" value={`Score ${offer.requiredScore}+, ${offer.requiredWeeks} semaines, paiements à temps ${offer.requiredOnTimeRate}%+`} />
          <InfoRow icon={Wallet} label="Paiement" value={`${formatCurrency(offer.dailyPayment)}/jour · apport ${formatCurrency(offer.downPayment)}`} />
          <InfoRow icon={Calendar} label="Durée" value={`${offer.termMonths} mois`} />
          <InfoRow icon={ShieldCheck} label="Engagement" value={offer.commitment} />
          {product && (
            <InfoRow
              icon={ShieldCheck}
              label="Moteur Layer 3A"
              value={`Produit versionné : ${product.name}. La demande crée un snapshot à la soumission.`}
            />
          )}
          {existing && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              Une demande existe déjà pour cette opportunité.
            </div>
          )}
          {!product && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              Produit crédit actif indisponible. Réessayez après synchronisation.
            </div>
          )}
          {!isOnline && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning flex items-start gap-2">
              <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Connexion requise pour envoyer une demande. Les informations restent consultables hors ligne.</span>
            </div>
          )}
          <Button className="w-full min-h-12" onClick={handleSubmit} disabled={existing || !isOnline || !product || applyForCredit.isPending}>
            {applyForCredit.isPending ? 'Envoi...' : !isOnline ? 'Connexion requise' : !product ? 'Produit indisponible' : 'Soumettre une demande versionnée'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Car; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

function ApplicationsCard({ loans }: { loans: DriverLoan[] }) {
  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-center">
          <Clock className="h-9 w-9 text-muted-foreground mx-auto mb-2" />
          <p className="font-semibold">Aucune demande en cours.</p>
          <p className="text-sm text-muted-foreground mt-1">Les demandes envoyées apparaîtront ici avec une explication claire.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Mes demandes</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {loans.map((loan) => {
          const offer = CREDIT_OFFERS.find((item) => item.type === loan.loan_type);
          const status = getLoanStatusDisplay(loan.status, loan.rejection_reason);
          return (
            <div key={loan.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{offer?.title || loan.loan_type}</p>
                  <p className="text-xs text-muted-foreground">Demandé le {formatDateShort(loan.applied_at)}</p>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{status.explanation}</p>
              <p className="mt-2 text-sm font-semibold">{formatCurrency(Number(loan.amount_requested || 0))}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CreditEngineFoundationCard({
  products,
  applications,
  accounts,
  invoices,
  isLoading,
  isError,
}: {
  products: CreditProductRow[];
  applications: CreditApplicationRow[];
  accounts: CreditAccountRow[];
  invoices: CreditInvoiceRow[];
  isLoading: boolean;
  isError: boolean;
}) {
  const activeProducts = products.filter((product) => product.status === 'ACTIVE');
  const latestApplication = applications[0];
  const latestInvoice = invoices[0];

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          My Credit Products
        </CardTitle>
        <CardDescription>Produits réels, versions, demandes, activation et factures d’apport.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : (
          <>
            {isError && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                Produits crédit indisponibles pour le moment. Réessayez après synchronisation.
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <MetricMini label="Produits actifs" value={`${activeProducts.length}`} />
              <MetricMini label="Demandes 3A" value={`${applications.length}`} />
              <MetricMini label="Comptes crédit" value={`${accounts.length}`} />
            </div>
            {activeProducts.length > 0 && (
              <div className="space-y-2">
                {activeProducts.slice(0, 3).map((product) => {
                  const activeVersion = product.product_versions?.find((version) => version.status === 'ACTIVE');
                  return (
                    <div key={product.product_id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-sm">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.description ?? 'Produit crédit configuré'}</p>
                        </div>
                        <Badge variant="outline">v{activeVersion?.version_number ?? 1}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {latestApplication ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{latestApplication.credit_products?.name ?? 'Demande crédit'}</p>
                    <p className="text-xs text-muted-foreground">
                      Snapshot v{latestApplication.product_versions?.version_number ?? 1} · score confirmé {latestApplication.score_snapshot ?? 'en attente'}
                    </p>
                  </div>
                  <Badge variant="secondary">{creditStatusLabel(latestApplication.status)}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{latestApplication.eligibility_explanation}</p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Aucune demande Layer 3A soumise. Les opportunités ouvertes ci-dessous créent désormais une demande persistée et auditée.
              </p>
            )}
            {latestInvoice && (
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>Facture d’apport</span>
                  <Badge variant={latestInvoice.status === 'paid' ? 'verified' : 'outline'}>
                    {creditStatusLabel(latestInvoice.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latestInvoice.invoice_number ?? 'En attente'} · {formatCurrency(latestInvoice.total_ttc)}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CalculatorCard({ score }: { score: number }) {
  const carOffer = CREDIT_OFFERS.find((offer) => offer.type === 'car_loan')!;
  const [simScore, setSimScore] = useState(score);
  const [downPayment, setDownPayment] = useState(carOffer.downPayment);
  const [term, setTerm] = useState(carOffer.termMonths);
  const simulation = calculateOwnershipSimulation(carOffer, downPayment, term);
  const scoreGap = Math.max(0, carOffer.requiredScore - simScore);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Simulateur propriété</CardTitle>
        <CardDescription>Simulation indicative, validation finale par DAM.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="sim-score">Score actuel</Label>
            <Input id="sim-score" type="number" min={500} max={1000} value={simScore} onChange={(e) => setSimScore(Number(e.target.value || 0))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="down-payment">Apport</Label>
            <Input id="down-payment" type="number" min={0} max={carOffer.amount} step={50_000} value={downPayment} onChange={(e) => setDownPayment(Number(e.target.value || 0))} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Durée</Label>
            <span className="font-semibold">{term} mois</span>
          </div>
          <Slider value={[term]} min={12} max={48} step={6} onValueChange={([value]) => setTerm(value)} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <MetricMini label="Paiement/jour" value={formatCurrency(simulation.dailyPayment)} />
          <MetricMini label="Total payé" value={formatCurrency(simulation.totalPaid)} />
          <MetricMini label="Date propriété" value={formatDateShort(simulation.ownershipDate)} />
        </div>
        {scoreGap > 0 && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Il manque {scoreGap} points avant de pouvoir déposer une demande voiture.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBreakdownCard({
  paymentRate,
  latestScore,
  controlStatus,
  kycStatus,
  weeksHistory,
  hasNegativeScoreEvent,
  loans,
}: {
  paymentRate: number;
  latestScore: DriverCreditScoreSnapshot | undefined;
  controlStatus: string;
  kycStatus: string;
  weeksHistory: number;
  hasNegativeScoreEvent: boolean;
  loans: DriverLoan[];
}) {
  const rows = [
    { label: 'Paiements', status: paymentRate >= 95 ? 'Excellent' : paymentRate >= 80 ? 'Bon' : 'À améliorer', icon: CreditCard },
    { label: 'Conduite', status: latestScore?.driving_data_available ? (Number(latestScore?.driving_impact || 0) >= 60 ? 'Bon' : 'À améliorer') : 'Données limitées', icon: Car },
    { label: 'Conformité', status: kycStatus === 'Validé' && controlStatus === 'À jour' ? 'Excellent' : controlStatus, icon: ShieldCheck },
    { label: 'Sinistralité', status: hasNegativeScoreEvent ? 'À améliorer' : 'Bon', icon: TrendingDown },
    { label: 'Crédit', status: loans.some((loan) => ['approved', 'repaying', 'completed'].includes(loan.status)) ? 'Actif' : 'Aucun prêt actif', icon: Wallet },
    { label: 'Activité', status: weeksHistory >= 26 ? 'Solide' : `${weeksHistory} semaines`, icon: TrendingUp },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pourquoi mon score est-il celui-ci ?</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          const needsWork = /améliorer|limitées|Aucun|semaines/.test(row.status);
          return (
            <div key={row.label} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', needsWork ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary')}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="font-semibold text-sm">{row.label}</p>
              </div>
              <span className={cn('text-sm font-semibold', needsWork ? 'text-warning' : 'text-primary')}>{row.status}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ScoreHistoryCard({ events, creditScores }: { events: ScoreEvent[]; creditScores: DriverCreditScoreSnapshot[] }) {
  const timeline = events.length > 0
    ? events.map((event) => ({
      id: event.id,
      delta: event.delta,
      label: event.reason,
      date: event.created_at,
    }))
    : creditScores.slice(0, 4).map((score, index) => {
      const previous = creditScores[index + 1];
      return {
        id: score.id,
        delta: previous ? score.score - previous.score : 0,
        label: 'Score hebdomadaire',
        date: score.calculation_week,
      };
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Historique du score</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun changement enregistré pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((item) => {
              const positive = item.delta >= 0;
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm', positive ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>
                    {positive ? '+' : ''}{item.delta}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(item.date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GamificationCard({
  weeklyStreak,
  paymentRate,
  activeInspectionStatus,
}: {
  weeklyStreak: number;
  paymentRate: number;
  activeInspectionStatus: string | null;
}) {
  const perfectWeek = paymentRate >= 95 && !['rejected', 'overdue', 'blocked'].includes(activeInspectionStatus ?? '');
  const weeklyReward = perfectWeek ? 5 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          Série et récompenses
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-warning/5 p-3">
          <p className="text-xs text-muted-foreground">Série actuelle</p>
          <p className="text-2xl font-bold">{weeklyStreak}</p>
          <p className="text-xs text-muted-foreground">semaines propres</p>
        </div>
        <div className="rounded-lg border bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">Semaine parfaite</p>
          <p className="text-2xl font-bold">+{weeklyReward}</p>
          <p className="text-xs text-muted-foreground">max +20/mois</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CoachCard({
  topic,
  setTopic,
  carGap,
  nextUnlock,
  improvementTips,
}: {
  topic: CoachTopic;
  setTopic: (topic: CoachTopic) => void;
  carGap: ReturnType<typeof getEligibilityGaps>;
  nextUnlock: CreditOffer | null;
  improvementTips: string[];
}) {
  const response = (() => {
    if (topic === 'car') {
      if (carGap.score === 0 && carGap.weeks === 0 && carGap.onTimeRate === 0) {
        return 'Vous pouvez déposer une demande voiture. DAM vérifiera ensuite vos documents, paiements et engagement.';
      }
      return `Pour obtenir une voiture, il manque ${carGap.score} points, ${carGap.weeks} semaines et ${carGap.onTimeRate}% de paiements à temps.`;
    }
    if (topic === 'next') {
      return nextUnlock
        ? `La prochaine opportunité est ${nextUnlock.title}. Avancez sur les écarts affichés avant de déposer une demande.`
        : 'Toutes les opportunités configurées sont ouvertes. Gardez votre historique propre.';
    }
    return improvementTips.join(' ');
  })();

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Coach KIRA
        </CardTitle>
        <CardDescription>Réponses basées sur votre score, paiements, KYC et contrôles.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Button variant={topic === 'car' ? 'default' : 'outline'} size="sm" onClick={() => setTopic('car')}>Voiture</Button>
          <Button variant={topic === 'next' ? 'default' : 'outline'} size="sm" onClick={() => setTopic('next')}>Prochaine</Button>
          <Button variant={topic === 'score' ? 'default' : 'outline'} size="sm" onClick={() => setTopic('score')}>Score</Button>
        </div>
        <div className="rounded-lg border bg-background p-3 text-sm">
          {response}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DriverCredit() {
  const { data: driverId, isLoading: driverIdLoading, isSuccess: driverIdResolved } = useDriverId();
  const { data: profile } = useDriverFullProfile();
  const { data: loans = [], isLoading: loansLoading } = useDriverLoans();
  const { data: payments = [], isLoading: paymentsLoading } = useDriverPayments();
  const { data: creditScores = [], isLoading: scoresLoading } = useDriverCreditScores();
  const { data: currentScore, isLoading: currentScoreLoading } = useDriverCurrentScore();
  const { data: activeInspection } = useDriverActiveInspection();
  const { data: scoreEvents = [] } = useScoreEvents(driverId);
  const { badges, isLoading: badgesLoading, earnedCount, totalCount } = useBadgesWithStatus();
  const { streak } = useDailyStreak();
  const creditEngineQuery = useDriverCreditEngineData();
  const [selectedOffer, setSelectedOffer] = useState<CreditOffer | null>(null);
  const [coachTopic, setCoachTopic] = useState<CoachTopic>('car');

  useLoansRealtime();
  useBadgeChecker();

  const isLoading = driverIdLoading || loansLoading || paymentsLoading || scoresLoading || currentScoreLoading;
  const scoreSnapshots = creditScores as DriverCreditScoreSnapshot[];
  const latestScore = scoreSnapshots[0];
  const driverLoans = loans as DriverLoan[];
  const score = Number(currentScore ?? scoreSnapshots[0]?.score ?? SCORE_RANGE_MIN);
  const scoreChange = scoreSnapshots.length >= 2 ? scoreSnapshots[0].score - scoreSnapshots[1].score : 0;
  const trust = getTrustLevelFromScore(score);
  const scoreTone = getScoreBand(score);
  const weeksHistory = scoreSnapshots.length;
  const paymentRate = calculateOnTimeRate(payments as PaymentLike[]);
  const paymentStreak = calculatePaymentStreak(payments as PaymentLike[]);
  const weeklyStreak = Math.max(0, Math.min(paymentStreak, weeksHistory || paymentStreak));
  const metrics = { score, weeksHistory, onTimeRate: paymentRate };
  const availableOffers = getAvailableOffers(CREDIT_OFFERS, metrics);
  const nextUnlock = getNextUnlock(CREDIT_OFFERS, metrics);
  const creditEngine = creditEngineQuery.data;
  const creditProducts = creditEngine?.products ?? [];
  const creditApplications = creditEngine?.applications ?? [];
  const creditAccounts = creditEngine?.accounts ?? [];
  const creditInvoices = creditEngine?.invoices ?? [];
  const selectedProductType = selectedOffer ? offerTypeToProductType[selectedOffer.type] : null;
  const selectedProduct = selectedProductType
    ? creditProducts.find((product) => product.product_type === selectedProductType && product.status === 'ACTIVE') ?? null
    : null;
  const carOffer = CREDIT_OFFERS.find((offer) => offer.type === 'car_loan')!;
  const carGap = getEligibilityGaps(carOffer, metrics);
  const hasNegativeScoreEvent = scoreEvents.some((event) => event.delta < 0);
  const existingSelectedOfferApplication = selectedOffer
    ? creditApplications.some((application) =>
      application.credit_products?.product_type === offerTypeToProductType[selectedOffer.type]
      && ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(application.status)
    )
    : false;
  const controlStatus = (() => {
    const status = activeInspection?.effective_status;
    if (!status) return 'À jour';
    if (status === 'approved' || status === 'submitted') return 'À jour';
    if (status === 'rejected') return 'À corriger';
    if (status === 'overdue' || status === 'blocked') return 'En retard';
    return 'À compléter';
  })();
  const kycStatus = profile?.kyc?.status === 'approved' || profile?.kyc?.status === 'verified' || profile?.kyc_status === 'approved'
    ? 'Validé'
    : 'KYC à compléter';

  const improvementTips = useMemo(() => {
    const tips: string[] = [];
    if (paymentRate < 95) tips.push('Payez à temps pour remonter le taux de paiements.');
    if (activeInspection && !['approved', 'submitted'].includes(activeInspection.effective_status)) tips.push('Complétez le contrôle véhicule demandé.');
    if (kycStatus !== 'Validé') tips.push('Mettez votre KYC à jour.');
    if (hasNegativeScoreEvent) tips.push('Évitez les sinistres et incidents responsables.');
    if (tips.length === 0) tips.push('Gardez vos paiements et contrôles à jour pour conserver votre niveau.');
    return tips;
  }, [paymentRate, activeInspection, kycStatus, hasNegativeScoreEvent]);

  const scoreVoice = `Votre score KIRA est ${score}. Votre niveau de confiance est ${trust.label}. L'objectif voiture est ${OWNERSHIP_SCORE_TARGET}.`;
  const ownershipVoice = `Il vous manque ${Math.max(0, OWNERSHIP_SCORE_TARGET - score)} points pour devenir éligible à une voiture. Votre taux de paiements à temps est ${paymentRate} pour cent.`;
  const headerVoice = nextUnlock
    ? `Votre score est ${score}. La prochaine opportunité est ${nextUnlock.title}. Il manque ${getEligibilityGaps(nextUnlock, metrics).score} points.`
    : `Votre score est ${score}. Toutes les opportunités configurées sont ouvertes.`;

  if (isLoading) return <LoadingSkeleton />;

  if (driverIdResolved && driverId === null) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: 'Crédit & Propriété' }]} />
        <PageHeader title="Crédit & Propriété" subtitle="Construisez votre avenir avec KIRA." />
        <NoDriverProfileAlert />
      </DriverLayout>
    );
  }

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: 'Crédit & Propriété' }]} />
      <PageHeader
        title="Crédit & Propriété"
        subtitle="Construisez votre avenir avec KIRA."
        action={<KiraVoiceButton text={headerVoice} compact />}
      />
      <KycGate>
        <div className="px-4 pb-24 space-y-4">
          <ScoreDashboard score={score} trustLabel={trust.label} scoreTone={scoreTone} scoreChange={scoreChange} voiceText={scoreVoice} />

          <TrustLevelsCard score={score} />

          <OwnershipJourneyCard score={score} weeksHistory={weeksHistory} paymentRate={paymentRate} voiceText={ownershipVoice} />

          <EligibilityGapCard score={score} weeksHistory={weeksHistory} paymentRate={paymentRate} controlStatus={controlStatus} kycStatus={kycStatus} />

          <CreditEngineFoundationCard
            products={creditProducts}
            applications={creditApplications}
            accounts={creditAccounts}
            invoices={creditInvoices}
            isLoading={creditEngineQuery.isLoading}
            isError={creditEngineQuery.isError}
          />

          <NextUnlockCard offer={nextUnlock} score={score} weeksHistory={weeksHistory} paymentRate={paymentRate} />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Opportunités disponibles</h2>
              <Badge variant="outline">{availableOffers.length}</Badge>
            </div>
            {availableOffers.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-6 text-center">
                  <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-semibold">Pas encore d’offre ouverte.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Les raisons et les écarts sont affichés ci-dessus.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {availableOffers.map((offer) => (
                  <OfferCard key={offer.type} offer={offer} onView={setSelectedOffer} />
                ))}
              </div>
            )}
          </section>

          <ApplicationsCard loans={driverLoans} />

          <CalculatorCard score={score} />

          <ScoreBreakdownCard
            paymentRate={paymentRate}
            latestScore={latestScore}
            controlStatus={controlStatus}
            kycStatus={kycStatus}
            weeksHistory={weeksHistory}
            hasNegativeScoreEvent={hasNegativeScoreEvent}
            loans={driverLoans}
          />

          <ScoreHistoryCard events={scoreEvents} creditScores={scoreSnapshots} />

          <GamificationCard weeklyStreak={weeklyStreak || streak} paymentRate={paymentRate} activeInspectionStatus={activeInspection?.effective_status ?? null} />

          <CoachCard topic={coachTopic} setTopic={setCoachTopic} carGap={carGap} nextUnlock={nextUnlock} improvementTips={improvementTips} />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Réussites</h2>
              <Link to="/driver/score" className="text-xs font-semibold text-primary">Voir score</Link>
            </div>
            <BadgeGrid badges={badges} isLoading={badgesLoading} earnedCount={earnedCount} totalCount={totalCount} />
          </div>

          <Card className="border-muted bg-muted/30">
            <CardContent className="p-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                Comment avancer maintenant
              </p>
              <div className="mt-3 space-y-2">
                {improvementTips.map((tip) => (
                  <div key={tip} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </KycGate>

      <OfferDialog
        offer={selectedOffer}
        product={selectedProduct}
        existing={existingSelectedOfferApplication}
        onClose={() => setSelectedOffer(null)}
      />
    </DriverLayout>
  );
}
