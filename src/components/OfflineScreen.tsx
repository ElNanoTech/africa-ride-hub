import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import damFlotteLogo from '@/assets/dam-flotte-logo.png';

interface OfflineScreenProps {
  onRetry: () => void;
}

export function OfflineScreen({ onRetry }: OfflineScreenProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    // Check actual connectivity
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
        mode: 'no-cors',
      });
    } catch {
      // ignore
    }
    onRetry();
    setTimeout(() => setIsRetrying(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center safe-top safe-bottom">
      <img src={damFlotteLogo} alt="DAM Flotte" className="w-16 h-16 rounded-2xl object-contain mb-8 opacity-60" />
      
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <WifiOff className="h-10 w-10 text-muted-foreground" />
      </div>

      <h1 className="text-xl font-bold mb-2">Pas de connexion internet</h1>
      <p className="text-sm text-muted-foreground max-w-xs mb-8">
        Vérifiez votre connexion Wi-Fi ou données mobiles et réessayez.
      </p>

      <Button
        size="lg"
        onClick={handleRetry}
        disabled={isRetrying}
        className="min-w-[200px] min-h-[48px] text-base"
      >
        <RefreshCw className={cn('h-5 w-5 mr-2', isRetrying && 'animate-spin')} />
        {isRetrying ? 'Vérification...' : 'Réessayer'}
      </Button>

      <p className="text-xs text-muted-foreground mt-6">
        Les données en cache restent accessibles hors ligne
      </p>
    </div>
  );
}
