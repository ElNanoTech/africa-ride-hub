import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Fingerprint, ScanFace, Shield, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import {
  isBiometricsAvailable,
  hasBiometricCredential,
  registerBiometrics,
  removeBiometricCredential,
  getBiometricsName,
  getBiometricsIcon,
} from '@/lib/webBiometrics';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BiometricSetupProps {
  phoneNumber: string;
  pin: string;
  onSetupComplete?: () => void;
  className?: string;
}

export function BiometricSetup({ phoneNumber, pin, onSetupComplete, className }: BiometricSetupProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [biometricsName, setBiometricsName] = useState('Biométrie');
  const [iconType, setIconType] = useState<'fingerprint' | 'scan-face' | 'shield'>('fingerprint');

  useEffect(() => {
    async function checkBiometrics() {
      const available = await isBiometricsAvailable();
      setIsAvailable(available);
      setIsEnabled(hasBiometricCredential());
      setBiometricsName(getBiometricsName());
      setIconType(getBiometricsIcon());
    }
    checkBiometrics();
  }, []);

  const handleToggle = async (enabled: boolean) => {
    if (!phoneNumber || !pin) {
      toast.error('Informations de connexion manquantes');
      return;
    }

    setIsLoading(true);
    try {
      if (enabled) {
        const result = await registerBiometrics(phoneNumber, pin);
        if (result.success) {
          setIsEnabled(true);
          toast.success(`${biometricsName} activé!`, {
            description: 'Vous pouvez maintenant vous connecter avec votre empreinte.',
          });
          onSetupComplete?.();
        } else {
          toast.error('Échec de l\'activation', {
            description: result.error,
          });
        }
      } else {
        removeBiometricCredential();
        setIsEnabled(false);
        toast.success(`${biometricsName} désactivé`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render if biometrics not available
  if (!isAvailable) {
    return null;
  }

  const Icon = iconType === 'scan-face' ? ScanFace : iconType === 'fingerprint' ? Fingerprint : Shield;

  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-lg border bg-card",
      className
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          isEnabled ? "bg-primary/10" : "bg-muted"
        )}>
          <Icon className={cn("w-5 h-5", isEnabled ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div>
          <p className="font-medium text-sm">{biometricsName}</p>
          <p className="text-xs text-muted-foreground">
            {isEnabled ? 'Connexion rapide activée' : 'Connexion plus rapide'}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

interface BiometricPromptProps {
  phoneNumber: string;
  pin: string;
  onComplete: () => void;
  onSkip: () => void;
  className?: string;
}

export function BiometricPrompt({ phoneNumber, pin, onComplete, onSkip, className }: BiometricPromptProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [biometricsName, setBiometricsName] = useState('Biométrie');
  const [iconType, setIconType] = useState<'fingerprint' | 'scan-face' | 'shield'>('fingerprint');

  useEffect(() => {
    async function checkBiometrics() {
      const available = await isBiometricsAvailable();
      setIsAvailable(available);
      
      // If already has credentials, skip prompt
      if (hasBiometricCredential()) {
        onComplete();
        return;
      }
      
      setBiometricsName(getBiometricsName());
      setIconType(getBiometricsIcon());
    }
    checkBiometrics();
  }, [onComplete]);

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      const result = await registerBiometrics(phoneNumber, pin);
      if (result.success) {
        toast.success(`${biometricsName} activé!`);
        onComplete();
      } else {
        toast.error(result.error || 'Échec de l\'activation');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAvailable) {
    // If biometrics not available, just complete
    onComplete();
    return null;
  }

  const Icon = iconType === 'scan-face' ? ScanFace : iconType === 'fingerprint' ? Fingerprint : Shield;

  return (
    <div className={cn("text-center space-y-6", className)}>
      <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
        <Icon className="w-10 h-10 text-primary" />
      </div>
      
      <div>
        <h3 className="text-lg font-semibold mb-2">Activer {biometricsName} ?</h3>
        <p className="text-sm text-muted-foreground">
          Connectez-vous plus rapidement la prochaine fois avec votre {biometricsName.toLowerCase()}.
        </p>
      </div>

      <div className="space-y-3">
        <Button
          className="w-full"
          onClick={handleEnable}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Icon className="w-4 h-4 mr-2" />
          )}
          Activer {biometricsName}
        </Button>
        
        <Button
          variant="ghost"
          className="w-full"
          onClick={onSkip}
          disabled={isLoading}
        >
          Plus tard
        </Button>
      </div>
    </div>
  );
}
