import { calculatePasswordStrength, getStrengthColor } from '@/lib/authSecurity';
import { cn } from '@/lib/utils';

interface PasswordStrengthMeterProps {
  password: string;
  showFeedback?: boolean;
  className?: string;
}

export function PasswordStrengthMeter({
  password,
  showFeedback = true,
  className,
}: PasswordStrengthMeterProps) {
  const { score, level, feedback } = calculatePasswordStrength(password);

  if (!password) return null;

  const levelLabels = {
    weak: 'Faible',
    fair: 'Moyen',
    good: 'Bon',
    strong: 'Fort',
    excellent: 'Excellent',
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300', getStrengthColor(level))}
            style={{ width: `${score}%` }}
          />
        </div>
        <span
          className={cn(
            'text-xs font-medium min-w-[70px] text-right',
            level === 'weak' && 'text-destructive',
            level === 'fair' && 'text-orange-500',
            level === 'good' && 'text-yellow-600',
            level === 'strong' && 'text-green-600',
            level === 'excellent' && 'text-emerald-600'
          )}
        >
          {levelLabels[level]}
        </span>
      </div>

      {/* Feedback */}
      {showFeedback && feedback.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {feedback.map((tip, index) => (
            <li key={index} className="flex items-center gap-1">
              <span className="text-amber-500">•</span>
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
