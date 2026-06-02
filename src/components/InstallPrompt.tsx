import { useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePWA } from '@/hooks/usePWA';

export function InstallPrompt() {
  const { isInstallable, isInstalled, promptInstall } = usePWA();
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't show if already installed, not installable, or dismissed
  if (isInstalled || !isInstallable || isDismissed) {
    return null;
  }

  const handleInstall = async () => {
    const success = await promptInstall();
    if (!success) {
      setIsDismissed(true);
    }
  };

  return (
    <Card className="fixed bottom-20 left-4 right-4 z-50 border-primary/20 bg-card/95 backdrop-blur-sm shadow-lg md:left-auto md:right-4 md:w-80">
      <CardContent className="p-4">
        <button 
          onClick={() => setIsDismissed(true)}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">Installer l'application</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Accédez plus rapidement à DAM Flotte depuis votre écran d'accueil
            </p>
            <Button 
              size="sm" 
              className="mt-3 gap-2"
              onClick={handleInstall}
            >
              <Download className="h-4 w-4" />
              Installer
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function OfflineBanner() {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-warning text-warning-foreground text-center py-2 text-sm font-medium">
      Mode hors ligne - Certaines fonctionnalités peuvent être limitées
    </div>
  );
}
