import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Fingerprint, ScanFace, Shield, Loader2 } from 'lucide-react';
import {
  isBiometricsAvailable,
  hasBiometricCredential,
  getBiometricUserInfo,
  authenticateWithBiometrics,
  getBiometricsName,
  getBiometricsIcon,
  BiometricResult,
} from '@/lib/webBiometrics';
import { cn } from '@/lib/utils';

interface BiometricLoginButtonProps {
  onAuthenticated: (phoneNumber: string, pin: string) => void;
  className?: string;
}

export function BiometricLoginButton({ onAuthenticated, className }: BiometricLoginButtonProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [hasCredential, setHasCredential] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [biometricsName, setBiometricsName] = useState('Biométrie');
  const [iconType, setIconType] = useState<'fingerprint' | 'scan-face' | 'shield'>('fingerprint');

  useEffect(() => {
    async function checkBiometrics() {
      const available = await isBiometricsAvailable();
      setIsAvailable(available);
      setHasCredential(hasBiometricCredential());
      setBiometricsName(getBiometricsName());
      setIconType(getBiometricsIcon());
    }
    checkBiometrics();
  }, []);

  const handleBiometricLogin = async () => {
    setIsAuthenticating(true);
    try {
      const result = await authenticateWithBiometrics();
      if (result.success && result.phoneNumber && result.pin) {
        onAuthenticated(result.phoneNumber, result.pin);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Don't render if biometrics not available or not registered
  if (!isAvailable || !hasCredential) {
    return null;
  }

  const userInfo = getBiometricUserInfo();
  const Icon = iconType === 'scan-face' ? ScanFace : iconType === 'fingerprint' ? Fingerprint : Shield;

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        variant="outline"
        size="lg"
        className="w-full border-primary/30 hover:border-primary hover:bg-primary/5"
        onClick={handleBiometricLogin}
        disabled={isAuthenticating}
      >
        {isAuthenticating ? (
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        ) : (
          <Icon className="w-5 h-5 mr-2 text-primary" />
        )}
        {isAuthenticating ? 'Vérification...' : `Connexion avec ${biometricsName}`}
      </Button>
      {userInfo && (
        <p className="text-xs text-center text-muted-foreground">
          Compte: {userInfo.phoneNumber.slice(-4).padStart(userInfo.phoneNumber.length, '•')}
        </p>
      )}
    </div>
  );
}
