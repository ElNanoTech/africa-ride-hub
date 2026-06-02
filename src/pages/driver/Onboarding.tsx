import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle, 
  FileText, 
  Car, 
  Sparkles,
  Shield,
  TrendingUp,
  ArrowRight,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HapticButton } from '@/components/HapticButton';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { supabaseDriver as supabase } from '@/integrations/supabase/clients';
import { useQuery } from '@tanstack/react-query';

interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: typeof FileText;
  iconBg: string;
  features: string[];
  action: {
    label: string;
    link: string;
  };
  completedLabel?: string;
}

interface StepCompletion {
  welcome: boolean;
  kyc: boolean;
  vehicles: boolean;
  loans: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenue sur DAM Flotte!',
    subtitle: 'Votre partenaire de mobilité',
    description: 'Louez un véhicule, construisez votre crédit, et accédez à des prêts avantageux.',
    icon: Sparkles,
    iconBg: 'bg-primary',
    features: [
      'Location de véhicules flexibles',
      'Score de crédit DAM personnalisé',
      'Accès aux prêts véhicule',
      'Support 24/7',
    ],
    action: {
      label: 'Commencer',
      link: '',
    },
  },
  {
    id: 'kyc',
    title: 'Vérifiez votre identité',
    subtitle: 'Étape 1: KYC',
    description: 'Soumettez vos documents pour débloquer toutes les fonctionnalités.',
    icon: Shield,
    iconBg: 'bg-warning',
    features: [
      "Carte d'identité ou passeport",
      'Permis de conduire (optionnel)',
      'Compte mobile Money',
      'Validation sous 24h',
    ],
    action: {
      label: 'Vérifier mon identité',
      link: '/driver/kyc',
    },
    completedLabel: 'KYC soumis ✓',
  },
  {
    id: 'vehicles',
    title: 'Découvrez notre flotte',
    subtitle: 'Étape 2: Véhicules',
    description: 'Parcourez nos véhicules disponibles et trouvez celui qui vous convient.',
    icon: Car,
    iconBg: 'bg-secondary',
    features: [
      'Motos et voitures disponibles',
      'Location à la journée',
      'Assurance incluse',
      'Entretien couvert',
    ],
    action: {
      label: 'Voir les véhicules',
      link: '/driver/vehicles',
    },
    completedLabel: 'Location active ✓',
  },
  {
    id: 'loans',
    title: 'Accédez aux prêts',
    subtitle: 'Étape 3: Financement',
    description: 'Améliorez votre score DAM pour débloquer des prêts attractifs.',
    icon: TrendingUp,
    iconBg: 'bg-tier-a',
    features: [
      "Prêts d'urgence dès le Niveau C",
      'Prêts caution au Niveau B',
      'Prêts véhicule au Niveau A',
      'Taux préférentiels',
    ],
    action: {
      label: 'Voir les options',
      link: '/driver/loans',
    },
    completedLabel: 'Prêts consultés ✓',
  },
];

function useDriverOnboardingStatus() {
  const { driverProfile } = useDriverAuth();

  // Fetch driver's full status including KYC and rentals
  const { data: statusData, isLoading } = useQuery({
    queryKey: ['driver-onboarding-status', driverProfile?.id],
    queryFn: async () => {
      if (!driverProfile?.id) return null;

      // Get KYC submission status
      const { data: kycSubmission } = await supabase
        .from('kyc_submissions')
        .select('status')
        .eq('driver_id', driverProfile.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get active rental
      const { data: activeRental } = await supabase
        .from('rentals')
        .select('id, status')
        .eq('driver_id', driverProfile.id)
        .in('status', ['active', 'pending', 'approved'])
        .limit(1)
        .maybeSingle();

      // Check if driver has viewed loans (we mark this in localStorage)
      const loansViewed = localStorage.getItem('onboarding-loans-viewed') === 'true';

      return {
        kycStatus: driverProfile.kycStatus || kycSubmission?.status || 'not_submitted',
        hasKycSubmission: !!kycSubmission,
        hasActiveRental: !!activeRental,
        rentalStatus: activeRental?.status,
        loansViewed,
      };
    },
    enabled: !!driverProfile?.id,
  });

  const stepCompletion: StepCompletion = useMemo(() => {
    if (!statusData) {
      return {
        welcome: true, // Always consider welcome as "viewable"
        kyc: false,
        vehicles: false,
        loans: false,
      };
    }

    const kycComplete = ['pending', 'approved', 'verified'].includes(statusData.kycStatus);

    return {
      welcome: true,
      kyc: kycComplete,
      vehicles: statusData.hasActiveRental,
      loans: statusData.loansViewed,
    };
  }, [statusData]);

  // Find the first incomplete step
  const firstIncompleteStepIndex = useMemo(() => {
    // If no status data yet, start from welcome
    if (!statusData) return 0;

    // KYC is the critical path - if not submitted, go there
    if (!stepCompletion.kyc) return 1; // KYC step

    // If KYC is done but no rental, suggest vehicles
    if (!stepCompletion.vehicles) return 2; // Vehicles step

    // If has rental, show loans
    if (!stepCompletion.loans) return 3; // Loans step

    // All done - they shouldn't be here, but show last step
    return ONBOARDING_STEPS.length - 1;
  }, [statusData, stepCompletion]);

  return {
    isLoading,
    stepCompletion,
    firstIncompleteStepIndex,
    statusData,
  };
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { isLoading: isAuthLoading, driverProfile } = useDriverAuth();
  const {
    isLoading: isStatusLoading,
    stepCompletion,
    firstIncompleteStepIndex,
  } = useDriverOnboardingStatus();

  const [currentStep, setCurrentStep] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Initialize to the first incomplete step
  useEffect(() => {
    if (!isStatusLoading && !initialized) {
      setCurrentStep(firstIncompleteStepIndex);
      setInitialized(true);
    }
  }, [isStatusLoading, firstIncompleteStepIndex, initialized]);

  // Show loading state.
  // IMPORTANT: also wait while auth is resolved but the driver profile hasn't been
  // hydrated yet — otherwise we briefly see `driverProfile === null` for an
  // authenticated user and wrongly redirect to /driver/profile-required.
  const profileHydrating = !isAuthLoading && !driverProfile;
  if (isAuthLoading || isStatusLoading || !initialized || profileHydrating) {
    return (
      <div className="min-h-screen bg-background flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-1 w-full mb-8" />
        <div className="flex justify-center mb-8 mt-8">
          <Skeleton className="w-24 h-24 rounded-3xl" />
        </div>
        <div className="text-center space-y-3 mb-8">
          <Skeleton className="h-4 w-32 mx-auto" />
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // Self-heal: if signup succeeded but driver profile wasn't created, redirect to dedicated page
  if (!driverProfile) {
    navigate('/driver/profile-required', { replace: true });
    return null;
  }

  const step = ONBOARDING_STEPS[currentStep];
  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;
  const isStepComplete = stepCompletion[step.id as keyof StepCompletion];
  const Icon = step.icon;

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('onboarding-completed', 'true');
    navigate('/driver');
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding-completed', 'true');
    navigate('/driver');
  };

  const handleAction = () => {
    if (step.action.link) {
      localStorage.setItem('onboarding-completed', 'true');
      // Mark loans as viewed if that's the current step
      if (step.id === 'loans') {
        localStorage.setItem('onboarding-loans-viewed', 'true');
      }
      navigate(step.action.link);
    } else {
      handleNext();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with progress */}
      <div className="p-4 pb-0">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Passer
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentStep + 1} / {ONBOARDING_STEPS.length}
          </span>
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            {/* Icon with completion badge */}
            <div className="flex justify-center mb-8 mt-8 relative">
              <div
                className={cn(
                  'w-24 h-24 rounded-3xl flex items-center justify-center',
                  step.iconBg,
                  isStepComplete && 'ring-4 ring-primary/20'
                )}
              >
                <Icon className="h-12 w-12 text-white" />
              </div>
              {isStepComplete && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -bottom-2 -right-2 bg-primary rounded-full p-1.5"
                >
                  <Check className="h-4 w-4 text-primary-foreground" />
                </motion.div>
              )}
            </div>

            {/* Completion badge */}
            {isStepComplete && step.completedLabel && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center mb-4"
              >
                <span className="bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full">
                  {step.completedLabel}
                </span>
              </motion.div>
            )}

            {/* Text content */}
            <div className="text-center mb-8">
              <p className="text-sm text-primary font-medium mb-2">{step.subtitle}</p>
              <h1 className="text-2xl font-bold mb-3">{step.title}</h1>
              <p className="text-muted-foreground">{step.description}</p>
            </div>

            {/* Features */}
            <Card className="mb-8">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {step.features.map((feature, index) => (
                    <motion.div
                      key={feature}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="space-y-3 mt-auto">
          <HapticButton
            size="lg"
            className="w-full"
            onClick={handleAction}
            hapticType="success"
            variant={isStepComplete ? 'outline' : 'default'}
          >
            {isStepComplete ? 'Revoir' : step.action.label}
            <ArrowRight className="h-4 w-4 ml-2" />
          </HapticButton>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={handlePrev}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Retour
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={handleNext}
            >
              {currentStep === ONBOARDING_STEPS.length - 1 ? 'Terminer' : 'Suivant'}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Step indicators with completion status */}
        <div className="flex justify-center gap-2 mt-6">
          {ONBOARDING_STEPS.map((s, index) => {
            const isComplete = stepCompletion[s.id as keyof StepCompletion];
            return (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all relative',
                  index === currentStep
                    ? 'w-6 bg-primary'
                    : isComplete
                      ? 'bg-primary/50'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
