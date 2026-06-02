import { validatePin, getStrengthLabel, getStrengthColor } from '@/lib/pinValidation';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PinStrengthIndicatorProps {
  pin: string;
  showError?: boolean;
  className?: string;
}

export function PinStrengthIndicator({ pin, showError = true, className }: PinStrengthIndicatorProps) {
  if (pin.length === 0) return null;

  const validation = validatePin(pin);
  
  // Only show strength indicator when PIN is complete
  if (pin.length !== 4) {
    return (
      <p className={cn("text-xs text-muted-foreground text-center mt-2", className)}>
        {pin.length}/4 chiffres
      </p>
    );
  }

  const strengthLabel = getStrengthLabel(validation.strength);
  const strengthColor = getStrengthColor(validation.strength);

  const StrengthIcon = validation.strength === 'strong' 
    ? ShieldCheck 
    : validation.strength === 'medium' 
      ? Shield 
      : ShieldAlert;

  return (
    <div className={cn("text-center mt-2 space-y-1", className)}>
      {/* Strength indicator */}
      <div className={cn("flex items-center justify-center gap-1.5 text-xs", strengthColor)}>
        <StrengthIcon className="w-3.5 h-3.5" />
        <span>Sécurité: {strengthLabel}</span>
      </div>

      {/* Strength bar */}
      <div className="flex gap-1 justify-center">
        <div className={cn(
          "h-1 w-8 rounded-full transition-colors",
          validation.strength === 'weak' ? 'bg-destructive' : 
          validation.strength === 'medium' ? 'bg-amber-500' : 'bg-green-500'
        )} />
        <div className={cn(
          "h-1 w-8 rounded-full transition-colors",
          validation.strength === 'medium' ? 'bg-amber-500' : 
          validation.strength === 'strong' ? 'bg-green-500' : 'bg-muted'
        )} />
        <div className={cn(
          "h-1 w-8 rounded-full transition-colors",
          validation.strength === 'strong' ? 'bg-green-500' : 'bg-muted'
        )} />
      </div>

      {/* Error message */}
      {showError && !validation.isValid && validation.error && (
        <p className="text-xs text-destructive mt-1">
          {validation.error}
        </p>
      )}
    </div>
  );
}
