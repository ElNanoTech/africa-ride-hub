import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, Star, Car, Banknote, Shield, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';

const TOUR_STEPS = [
  {
    icon: Star,
    title: 'Votre Score DAM',
    description: 'Suivez votre score de confiance. Plus il est élevé, plus vous accédez à des avantages.',
    color: 'bg-primary/10 text-primary',
  },
  {
    icon: Car,
    title: 'Véhicules',
    description: 'Parcourez les véhicules disponibles et faites une demande de location en un tap.',
    color: 'bg-secondary/10 text-secondary',
  },
  {
    icon: Banknote,
    title: 'Revenus',
    description: 'Déclarez vos revenus pour améliorer votre score et débloquer des prêts.',
    color: 'bg-warning/10 text-warning',
  },
  {
    icon: Shield,
    title: 'Vérification KYC',
    description: 'Vérifiez votre identité pour pouvoir louer un véhicule. C\'est simple et rapide!',
    color: 'bg-primary/10 text-primary',
  },
  {
    icon: Headphones,
    title: 'Support 24/7',
    description: 'Besoin d\'aide? Envoyez un message texte ou vocal. Notre équipe est là pour vous.',
    color: 'bg-muted text-muted-foreground',
  },
];

const TOUR_KEY = 'driver-tour-completed';

export function useOnboardingTour() {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    const onboarded = localStorage.getItem('onboarding-completed');
    // Show tour after onboarding is done but tour hasn't been shown
    if (onboarded === 'true' && !completed) {
      // Small delay to let the home page render first
      const timer = setTimeout(() => setIsActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_KEY, 'true');
    setIsActive(false);
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_KEY);
    setIsActive(true);
  }, []);

  return { isActive, completeTour, resetTour };
}

interface OnboardingTourProps {
  isActive: boolean;
  onComplete: () => void;
}

export function OnboardingTour({ isActive, onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!isActive) return null;

  const currentStep = TOUR_STEPS[step];
  const Icon = currentStep.icon;
  const progress = ((step + 1) / TOUR_STEPS.length) * 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end justify-center safe-bottom"
        onClick={handleSkip}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-card rounded-t-3xl p-6 pb-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div className="w-full h-1 bg-muted rounded-full mb-6 overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Close button */}
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="text-center"
            >
              <div className={cn(
                'w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center',
                currentStep.color
              )}>
                <Icon className="h-10 w-10" />
              </div>

              <h2 className="text-xl font-bold mb-2">{currentStep.title}</h2>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
                {currentStep.description}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 mt-6 mb-6">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  i === step ? 'w-6 bg-primary' : 'w-2 bg-muted',
                )}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={handleSkip}
            >
              Passer
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleNext}
            >
              {step < TOUR_STEPS.length - 1 ? (
                <>
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </>
              ) : (
                'C\'est parti! 🚀'
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
