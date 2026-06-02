import { CheckCircle, Circle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MVP_HIDE_DRIVER_KYC } from '@/lib/mvpFlags';

interface ProfileStep {
  id: string;
  label: string;
  completed: boolean;
  link: string;
}

interface ProfileCompletionIndicatorProps {
  driverProfile: {
    full_name?: string;
    phone_number?: string;
    email?: string;
    kyc_status?: string;
    profile_image_url?: string;
  } | null;
  hasActiveRental?: boolean;
  hasLoanApplication?: boolean;
  className?: string;
  variant?: 'compact' | 'detailed';
}

export function ProfileCompletionIndicator({
  driverProfile,
  hasActiveRental = false,
  hasLoanApplication = false,
  className,
  variant = 'compact',
}: ProfileCompletionIndicatorProps) {
  const steps: ProfileStep[] = [
    {
      id: 'profile',
      label: 'Nom et téléphone',
      completed: !!(driverProfile?.full_name && driverProfile?.phone_number),
      link: '/driver/profile',
    },
    {
      id: 'photo',
      label: 'Photo de profil',
      completed: !!driverProfile?.profile_image_url,
      link: '/driver/profile',
    },
    // KYC step hidden during MVP — admin handles KYC for the driver.
    ...(MVP_HIDE_DRIVER_KYC ? [] : [{
      id: 'kyc',
      label: 'KYC vérifié',
      completed: driverProfile?.kyc_status === 'verified',
      link: '/driver/kyc',
    }]),
  ];

  const completedSteps = steps.filter(s => s.completed).length;
  const completionPercentage = Math.round((completedSteps / steps.length) * 100);

  // Don't show if all steps are completed
  if (completionPercentage === 100) return null;

  if (variant === 'compact') {
    return (
      <Card className={cn('border-primary/20 bg-primary/5', className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Profil complété à {completionPercentage}%</span>
            <Link 
              to={steps.find(s => !s.completed)?.link || '/driver/profile'}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              Continuer
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <Progress value={completionPercentage} className="h-2 bg-primary/10" />
          <p className="text-xs text-muted-foreground mt-2">
            {completedSteps}/{steps.length} étapes complétées
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('', className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Complétez votre profil</h3>
            <p className="text-sm text-muted-foreground">{completionPercentage}% complété</p>
          </div>
          <div className="text-2xl font-bold text-primary">{completionPercentage}%</div>
        </div>
        
        <Progress value={completionPercentage} className="h-2 mb-4 bg-muted" />
        
        <div className="space-y-3">
          {steps.map((step) => (
            <Link
              key={step.id}
              to={step.link}
              className={cn(
                'flex items-center gap-3 p-2 rounded-lg transition-colors',
                step.completed 
                  ? 'bg-primary/5' 
                  : 'hover:bg-muted/50'
              )}
            >
              {step.completed ? (
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <span className={cn(
                'text-sm flex-1',
                step.completed ? 'text-muted-foreground line-through' : 'font-medium'
              )}>
                {step.label}
              </span>
              {!step.completed && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}