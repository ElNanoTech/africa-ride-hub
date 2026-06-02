import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AUTH } from '@/lib/i18n';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { Phone, ArrowLeft, TestTube2, User, KeyRound, Smartphone } from 'lucide-react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import damFlotteLogo from '@/assets/dam-flotte-logo.png';
import { toast } from 'sonner';
import { AUTH_PROVIDERS, getEnabledProviders } from '@/lib/authProviders';
import { useDriverAuthMode } from '@/hooks/useDriverAuthMode';
import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';
import { validatePin } from '@/lib/pinValidation';
import { PinStrengthIndicator } from '@/components/PinStrengthIndicator';
import { BiometricLoginButton } from '@/components/BiometricLoginButton';
import { BiometricPrompt } from '@/components/BiometricSetup';
import { hasBiometricCredential, isBiometricsAvailable } from '@/lib/webBiometrics';
import { setDeviceTrusted, extendDeviceTrust, isDeviceTrusted } from '@/lib/trustedDevice';
import { PhoneInput, validatePhoneNumber } from '@/components/PhoneInput';

type LoginMode = 'select' | 'yango' | 'native' | 'phone-otp' | 'otp-verify' | 'forgot-pin' | 'reset-pin-verify' | 'reset-pin-new' | 'biometric-prompt';

export default function DriverLogin() {
  const navigate = useNavigate();
  const {
    loginWithYango,
    loginWithTestMode,
    loginWithNative,
    sendOTP,
    verifyOTP,
    sendPinResetOTP,
    verifyAndResetPIN,
    isLoading,
    isAuthenticated
  } = useDriverAuth();

  const [mode, setMode] = useState<LoginMode>('select');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otp, setOtp] = useState('');
  const [showDevOptions, setShowDevOptions] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [pendingLoginCredentials, setPendingLoginCredentials] = useState<{ phone: string; pin: string } | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(isDeviceTrusted());
  const [isPhoneValid, setIsPhoneValid] = useState(false);

  // Check if biometrics is available on mount
  useEffect(() => {
    isBiometricsAvailable().then(setBiometricsAvailable);
  }, []);
  const { data: enableYango } = useIsFeatureEnabled('enable_yango_login');
  const { data: enableNative } = useIsFeatureEnabled('enable_native_login');
  const { data: authMode = 'org_managed', isLoading: modeLoading } = useDriverAuthMode();

  // Auto-route to the form matching the platform-active mode.
  useEffect(() => {
    if (modeLoading || mode !== 'select') return;
    if (authMode === 'org_managed') setMode('native');
    else if (authMode === 'whatsapp_otp') setMode('phone-otp');
    // For 'yango_oauth' we keep the select screen so the user can click the Yango button.
  }, [authMode, modeLoading, mode]);

  // B30 — Redirect handled by <DriverLoginRedirect> wrapper in App.tsx.
  // We keep a backup useEffect to also redirect on auth state change AFTER mount
  // (e.g. user logs in, then navigates back to /driver/login).
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/driver', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleYangoLogin = async () => {
    const result = await loginWithYango();
    if (result.success) {
      navigate('/driver-dashboard');
    }
  };

  const handleTestLogin = async () => {
    toast.info('Connexion en mode test...');
    const result = await loginWithTestMode();
    if (result.success) {
      navigate('/driver-dashboard');
    }
  };

  const handleNativeLogin = async (overridePhone?: string, overridePin?: string) => {
    const phone = overridePhone || phoneNumber;
    const pinCode = overridePin || pin;
    
    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      toast.error('Numéro de téléphone invalide', { description: phoneValidation.error });
      return;
    }
    if (!pinCode || pinCode.length !== 4) {
      toast.error('Code PIN à 4 chiffres requis');
      return;
    }
    
    const result = await loginWithNative(phone, pinCode);
    if (result.success) {
      // Handle remember device
      if (rememberDevice) {
        setDeviceTrusted();
      } else {
        extendDeviceTrust(); // Extend if already trusted
      }
      
      // Check if we should prompt for biometric setup
      if (biometricsAvailable && !hasBiometricCredential()) {
        setPendingLoginCredentials({ phone, pin: pinCode });
        setMode('biometric-prompt');
      } else {
        navigate('/driver-dashboard');
      }
    } else if (result.error) {
      // Show error message to user
      if (result.error.includes('Code PIN incorrect') || result.error.includes('Invalid')) {
        toast.error('Identifiants incorrects', {
          description: 'Vérifiez votre numéro de téléphone et code PIN, ou créez un compte.',
        });
      } else {
        toast.error('Erreur de connexion', {
          description: result.error,
        });
      }
    }
  };

  // Handle biometric authentication
  const handleBiometricAuth = async (bioPhone: string, bioPin: string) => {
    const result = await loginWithNative(bioPhone, bioPin, true); // Pass true for biometric login
    if (result.success) {
      navigate('/driver-dashboard');
    } else {
      toast.error('Échec de la connexion biométrique', {
        description: 'Veuillez vous connecter avec votre code PIN.',
      });
      setMode('native');
    }
  };

  // Native self-registration removed (Section 5: drivers are admin-provisioned only).
  // Use AdminCreateDriverDialog or the import-drivers CSV flow to create accounts.

  const handleSendOTP = async () => {
    const phoneValidation = validatePhoneNumber(phoneNumber);
    if (!phoneValidation.isValid) {
      toast.error('Numéro de téléphone invalide', { description: phoneValidation.error });
      return;
    }
    const result = await sendOTP(phoneNumber);
    if (result.success) {
      setMode('otp-verify');
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) return;
    const result = await verifyOTP(phoneNumber, otp);
    if (result.success) {
      navigate('/driver-dashboard');
    }
  };

  // Forgot PIN handlers
  const handleForgotPinSendOTP = async () => {
    const phoneValidation = validatePhoneNumber(phoneNumber);
    if (!phoneValidation.isValid) {
      toast.error('Numéro de téléphone invalide', { description: phoneValidation.error });
      return;
    }
    const result = await sendPinResetOTP(phoneNumber);
    if (result.success) {
      setOtp('');
      setMode('reset-pin-verify');
    }
  };

  const handleVerifyResetOTP = async () => {
    if (otp.length !== 6) {
      toast.error('Le code doit contenir 6 chiffres');
      return;
    }
    // Move to new PIN entry
    setNewPin('');
    setConfirmPin('');
    setMode('reset-pin-new');
  };

  const handleResetPIN = async () => {
    if (newPin.length !== 4) {
      toast.error('Le PIN doit contenir 4 chiffres');
      return;
    }
    
    // Validate PIN strength
    const pinValidation = validatePin(newPin);
    if (!pinValidation.isValid) {
      toast.error('Code PIN trop faible', {
        description: pinValidation.error,
      });
      return;
    }
    
    if (newPin !== confirmPin) {
      toast.error('Les codes PIN ne correspondent pas');
      return;
    }
    
    const result = await verifyAndResetPIN(phoneNumber, otp, newPin);
    if (result.success) {
      // Clear all fields and go back to login
      setPin('');
      setNewPin('');
      setConfirmPin('');
      setOtp('');
      setMode('native');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center p-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        {/* Logo */}
        <div className="mb-8 text-center">
          <img 
            src={damFlotteLogo} 
            alt="DAM Flotte" 
            className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-glow object-contain"
          />
          <h1 className="text-3xl font-bold text-white">DAM Flotte</h1>
          <p className="text-sm text-white/60 mt-1">Côte d'Ivoire 🇨🇮</p>
        </div>

        {/* Login card */}
        <div className="w-full bg-card rounded-2xl p-8 shadow-2xl">
          
          {/* Provider Selection Mode */}
          {mode === 'select' && (
            <>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {AUTH.WELCOME}
                </h2>
                <p className="text-muted-foreground">
                  Choisissez votre méthode de connexion
                </p>
              </div>

              <div className="space-y-3">
                {/* Biometric Login (if available and registered) */}
                <BiometricLoginButton onAuthenticated={handleBiometricAuth} />
                
                {/* Native Phone + PIN Login (Primary) */}
                <Button
                  variant="default"
                  size="xl"
                  className="w-full"
                  onClick={() => setMode('native')}
                >
                  <Smartphone className="w-5 h-5 mr-2" />
                  Connexion avec téléphone
                </Button>

                {/* Yango Login (Optional) */}
                <Button
                  variant="yango"
                  size="xl"
                  className="w-full"
                  onClick={handleYangoLogin}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Connexion...
                    </div>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                      Continuer avec Yango
                    </>
                  )}
                </Button>

                {/* Divider with OTP option */}
                {showDevOptions && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">ou</span>
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setMode('phone-otp')}
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Connexion par SMS (OTP)
                    </Button>
                  </>
                )}
              </div>

              {/* Test Mode Button - DEV only */}
              {import.meta.env.DEV && (
                <div className="mt-6 pt-4 border-t border-border">
                  <p className="text-xs text-center text-muted-foreground mb-3">
                    🧪 Mode Test / Démo
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed border-amber-500/50 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    onClick={handleTestLogin}
                    disabled={isLoading}
                  >
                    <TestTube2 className="w-4 h-4 mr-2" />
                    {isLoading ? 'Connexion...' : 'Tester comme conducteur'}
                  </Button>
                </div>
              )}

              {/* Dev toggle - DEV only */}
              {import.meta.env.DEV && (
                <button
                  type="button"
                  className="mt-4 text-xs text-muted-foreground/50 hover:text-muted-foreground w-full text-center"
                  onClick={() => setShowDevOptions(!showDevOptions)}
                >
                  {showDevOptions ? 'Masquer' : 'Afficher'} options (dev)
                </button>
              )}
            </>
          )}

          {/* Native Phone + PIN Login */}
          {mode === 'native' && (
            <>
              <button
                type="button"
                onClick={() => setMode('select')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>

              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Connexion
                </h2>
                <p className="text-sm text-muted-foreground">
                  Entrez votre numéro et code PIN
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Téléphone</label>
                  <PhoneInput
                    value={phoneNumber}
                    onChange={(fullNumber, isValid) => {
                      setPhoneNumber(fullNumber);
                      setIsPhoneValid(isValid);
                    }}
                    defaultCountry="CI"
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Code PIN (4 chiffres)</label>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={4}
                      value={pin}
                      onChange={(value) => setPin(value)}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>

                {/* Remember Device Checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember-device"
                    checked={rememberDevice}
                    onCheckedChange={(checked) => setRememberDevice(checked === true)}
                  />
                  <label
                    htmlFor="remember-device"
                    className="text-sm text-muted-foreground cursor-pointer select-none"
                  >
                    Se souvenir de cet appareil (30 jours)
                  </label>
                </div>

                <Button
                  className="w-full"
                  onClick={() => handleNativeLogin()}
                  disabled={isLoading || !isPhoneValid || pin.length !== 4}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Connexion...
                    </div>
                  ) : (
                    'Se connecter'
                  )}
                </Button>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOtp('');
                      setMode('forgot-pin');
                    }}
                    className="w-full text-sm text-muted-foreground hover:text-primary hover:underline"
                  >
                    PIN oublié ?
                  </button>
                  <p className="text-center text-xs text-muted-foreground px-2 leading-relaxed">
                    Nouveau conducteur ? Contactez votre gestionnaire de flotte.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Forgot PIN - Enter Phone */}
          {mode === 'forgot-pin' && (
            <>
              <button
                type="button"
                onClick={() => setMode('native')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>

              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  PIN oublié ?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Entrez votre numéro de téléphone pour recevoir un code de vérification par SMS
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Téléphone</label>
                  <PhoneInput
                    value={phoneNumber}
                    onChange={(fullNumber, isValid) => {
                      setPhoneNumber(fullNumber);
                      setIsPhoneValid(isValid);
                    }}
                    defaultCountry="CI"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleForgotPinSendOTP}
                  disabled={isLoading || !isPhoneValid}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Envoi...
                    </div>
                  ) : (
                    'Recevoir le code par SMS'
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Forgot PIN - Verify OTP */}
          {mode === 'reset-pin-verify' && (
            <>
              <button
                type="button"
                onClick={() => setMode('forgot-pin')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>

              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Vérification SMS
                </h2>
                <p className="text-sm text-muted-foreground">
                  Entrez le code à 6 chiffres envoyé au<br />
                  <span className="font-medium text-foreground">{phoneNumber}</span>
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => setOtp(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  className="w-full"
                  onClick={handleVerifyResetOTP}
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Vérification...
                    </div>
                  ) : (
                    'Vérifier'
                  )}
                </Button>

                <button
                  type="button"
                  onClick={handleForgotPinSendOTP}
                  className="w-full text-sm text-primary hover:underline"
                  disabled={isLoading}
                >
                  Renvoyer le code
                </button>
              </div>
            </>
          )}

          {/* Forgot PIN - Enter New PIN */}
          {mode === 'reset-pin-new' && (
            <>
              <button
                type="button"
                onClick={() => setMode('reset-pin-verify')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>

              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Nouveau code PIN
                </h2>
                <p className="text-sm text-muted-foreground">
                  Créez un nouveau code PIN à 4 chiffres
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Nouveau PIN</label>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={4}
                      value={newPin}
                      onChange={(value) => setNewPin(value)}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <PinStrengthIndicator pin={newPin} />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Confirmer le PIN</label>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={4}
                      value={confirmPin}
                      onChange={(value) => setConfirmPin(value)}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {confirmPin.length === 4 && newPin !== confirmPin && (
                    <p className="text-xs text-destructive text-center mt-2">
                      Les codes PIN ne correspondent pas
                    </p>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={handleResetPIN}
                  disabled={isLoading || newPin.length !== 4 || confirmPin.length !== 4 || newPin !== confirmPin || !validatePin(newPin).isValid}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Réinitialisation...
                    </div>
                  ) : (
                    'Réinitialiser le PIN'
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Native Registration removed — drivers are admin-provisioned. */}

          {/* Phone OTP Mode */}
          {mode === 'phone-otp' && (
            <>
              <button
                type="button"
                onClick={() => setMode('select')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>

              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Connexion par SMS
                </h2>
                <p className="text-sm text-muted-foreground">
                  Entrez votre numéro de téléphone
                </p>
              </div>

              <div className="space-y-4">
                <PhoneInput
                  value={phoneNumber}
                  onChange={(fullNumber, isValid) => {
                    setPhoneNumber(fullNumber);
                    setIsPhoneValid(isValid);
                  }}
                  defaultCountry="CI"
                />

                <Button
                  className="w-full"
                  onClick={handleSendOTP}
                  disabled={isLoading || !isPhoneValid}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Envoi...
                    </div>
                  ) : (
                    'Recevoir le code'
                  )}
                </Button>
              </div>
            </>
          )}

          {/* OTP Verification */}
          {mode === 'otp-verify' && (
            <>
              <button
                type="button"
                onClick={() => setMode('phone-otp')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>

              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Code de vérification
                </h2>
                <p className="text-sm text-muted-foreground">
                  Entrez le code envoyé au {phoneNumber}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => setOtp(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  className="w-full"
                  onClick={handleVerifyOTP}
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Vérification...
                    </div>
                  ) : (
                    'Vérifier'
                  )}
                </Button>

                <button
                  type="button"
                  onClick={handleSendOTP}
                  className="w-full text-sm text-primary hover:underline"
                  disabled={isLoading}
                >
                  Renvoyer le code
                </button>
              </div>
            </>
          )}

          {/* Biometric Setup Prompt */}
          {mode === 'biometric-prompt' && pendingLoginCredentials && (
            <BiometricPrompt
              phoneNumber={pendingLoginCredentials.phone}
              pin={pendingLoginCredentials.pin}
              onComplete={() => {
                setPendingLoginCredentials(null);
                navigate('/driver-dashboard');
              }}
              onSkip={() => {
                setPendingLoginCredentials(null);
                navigate('/driver-dashboard');
              }}
            />
          )}

          <p className="text-xs text-center text-muted-foreground mt-6">
            En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center space-y-3">
          <p className="text-xs text-white/40">
            © 2026 DAM Flotte. Tous droits réservés.
          </p>
          <a 
            href="/admin/login" 
            className="text-xs text-[#9CA3AF] hover:underline"
          >
            Espace équipe (Admin)
          </a>
        </div>
      </div>
    </div>
  );
}
