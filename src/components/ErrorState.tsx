import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { UI } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  variant?: 'inline' | 'full' | 'card';
  className?: string;
}

export function ErrorState({ 
  title = UI.ERROR, 
  message,
  onRetry, 
  variant = 'card',
  className 
}: ErrorStateProps) {
  const content = (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      variant === 'full' && 'py-16',
      variant === 'inline' && 'py-8',
      variant === 'card' && 'p-8'
    )}>
      <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {message && (
        <p className="text-sm text-muted-foreground max-w-xs mb-4">{message}</p>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {UI.RETRY}
        </Button>
      )}
    </div>
  );

  if (variant === 'card') {
    return (
      <Card className={className}>
        <CardContent className="p-0">
          {content}
        </CardContent>
      </Card>
    );
  }

  return <div className={className}>{content}</div>;
}

interface NetworkErrorProps {
  onRetry?: () => void;
  className?: string;
}

export function NetworkError({ onRetry, className }: NetworkErrorProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <WifiOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Pas de connexion</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">
        Vérifiez votre connexion internet et réessayez.
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {UI.RETRY}
        </Button>
      )}
    </div>
  );
}
