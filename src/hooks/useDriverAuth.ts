import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseDriver as supabase } from '@/integrations/supabase/clients';
import { User, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { authProviders, AuthResult, AuthProvider } from '@/lib/authProviders';
import { isDeviceTrusted, removeDeviceTrust } from '@/lib/trustedDevice';
import { recordLoginActivity } from '@/lib/loginActivity';

interface DriverProfile {
  id: string;
  fullName: string;
  phoneNumber: string;
  yangoDriverId: string;
  kycStatus: string;
  driverStatus: string;
  profileImageUrl?: string;
  authProvider?: AuthProvider;
  customer_id?: string | null;
}

let focusRefreshInFlight: Promise<unknown> | null = null;
let lastFocusRefreshAt = 0;
const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000;

const refreshSessionOnceOnFocus = () => {
  if (document.visibilityState !== 'visible') return;

  const now = Date.now();
  if (focusRefreshInFlight || now - lastFocusRefreshAt < FOCUS_REFRESH_MIN_INTERVAL_MS) return;

  lastFocusRefreshAt = now;
  focusRefreshInFlight = supabase.auth.refreshSession()
    .catch(() => {
      // Silent — onAuthStateChange will handle a true sign-out.
    })
    .finally(() => {
      focusRefreshInFlight = null;
    });
};

export function useDriverAuth() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Fetch driver profile from database
  const fetchDriverProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Determine auth provider from yango_driver_id prefix
        let authProvider: AuthProvider = 'yango';
        if (data.yango_driver_id?.startsWith('NATIVE_')) authProvider = 'native';
        else if (data.yango_driver_id?.startsWith('OTP_')) authProvider = 'native';
        else if (data.yango_driver_id?.startsWith('TEST_')) authProvider = 'test';
        else if (data.yango_driver_id?.startsWith('PHONE_')) authProvider = 'native';

        setDriverProfile({
          id: data.id,
          fullName: data.full_name,
          phoneNumber: data.phone_number,
          yangoDriverId: data.yango_driver_id,
          kycStatus: data.kyc_status,
          driverStatus: data.driver_status,
          profileImageUrl: data.profile_image_url || undefined,
          authProvider,
          customer_id: data.customer_id,
        });
      }
      return data;
    } catch (error) {
      console.error('Error fetching driver profile:', error);
      return null;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsAuthenticated(!!session?.user);
        
        // Defer profile fetch to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchDriverProfile(session.user.id);
          }, 0);
        } else {
          setDriverProfile(null);
        }
        
        setIsLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsAuthenticated(!!session?.user);
      
      if (session?.user) {
        fetchDriverProfile(session.user.id);
      }
      setIsLoading(false);
    });

    // Refresh the session whenever the tab regains focus or becomes visible.
    // Mobile browsers throttle background timers, which can let access tokens
    // expire before autoRefreshToken fires — this gives drivers a smooth
    // experience even after the app was backgrounded for many hours.
    window.addEventListener('focus', refreshSessionOnceOnFocus);
    document.addEventListener('visibilitychange', refreshSessionOnceOnFocus);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', refreshSessionOnceOnFocus);
      document.removeEventListener('visibilitychange', refreshSessionOnceOnFocus);
    };
  }, [fetchDriverProfile]);

  // Provider-agnostic login methods
  const loginWithYango = async (simulatedYangoId?: string): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const result = await authProviders.yango.login(simulatedYangoId);
      if (result.success) {
        toast.success('Connexion réussie!');
        // Record successful login (driverId will be fetched after)
        if (result.driverId) {
          recordLoginActivity(result.driverId, 'yango', true);
        }
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithTestMode = async (): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const result = await authProviders.test.login();
      if (result.success && result.driverId) {
        recordLoginActivity(result.driverId, 'test', true);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithNative = async (phoneNumber: string, pin: string, isBiometric: boolean = false): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const result = await authProviders.native.login(phoneNumber, pin);
      if (result.success) {
        toast.success('Connexion réussie!');
        // Record login activity - we need to get the driver ID
        const { data: driver } = await supabase
          .from('drivers')
          .select('id')
          .or(`phone_number.eq.${phoneNumber},yango_driver_id.ilike.%${phoneNumber.replace(/\D/g, '')}%`)
          .maybeSingle();
        
        if (driver) {
          recordLoginActivity(driver.id, isBiometric ? 'biometric' : 'pin', true);
        }
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  // Native self-registration was removed: drivers are now exclusively admin-provisioned.

  // Phone OTP methods (backup option)
  const sendOTP = async (phoneNumber: string): Promise<AuthResult> => {
    try {
      const result = await authProviders.otp.send(phoneNumber);
      if (result.success) {
        toast.success('Code de vérification envoyé!');
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const verifyOTP = async (phoneNumber: string, otp: string): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const result = await authProviders.otp.verify(phoneNumber, otp);
      if (result.success) {
        toast.success('Connexion réussie!');
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  // PIN Reset methods
  const sendPinResetOTP = async (phoneNumber: string): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const result = await authProviders.pinReset.sendOTP(phoneNumber);
      if (result.success) {
        toast.success('Code de vérification envoyé par SMS!');
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    } catch (error: any) {
      toast.error('Erreur d\'envoi du code');
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyAndResetPIN = async (
    phoneNumber: string,
    otp: string,
    newPin: string
  ): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const result = await authProviders.pinReset.verifyAndReset(phoneNumber, otp, newPin);
      if (result.success) {
        toast.success('PIN réinitialisé avec succès!', {
          description: 'Vous pouvez maintenant vous connecter avec votre nouveau PIN.',
        });
      } else if (result.error) {
        toast.error('Erreur de réinitialisation', {
          description: result.error,
        });
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    setIsLoading(true);
    try {
      // Clear trusted device status on explicit logout
      removeDeviceTrust();
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setDriverProfile(null);
      setIsAuthenticated(false);
      toast.success('Déconnexion réussie');
      navigate('/driver/login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Erreur lors de la déconnexion');
    } finally {
      setIsLoading(false);
    }
  };

  // Check device trust status - provides info to components
  const deviceTrusted = isDeviceTrusted();

  return {
    user,
    session,
    driverProfile,
    isLoading,
    isAuthenticated,
    deviceTrusted,
    // Provider-specific methods
    loginWithYango,
    loginWithTestMode,
    loginWithNative,
    // OTP methods
    sendOTP,
    verifyOTP,
    // PIN Reset methods
    sendPinResetOTP,
    verifyAndResetPIN,
    // General
    logout,
    refetchProfile: () => user && fetchDriverProfile(user.id),
  };
}

// Hook to protect driver routes
export function useRequireDriverAuth() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, driverProfile } = useDriverAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/driver/login', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return { isLoading, isAuthenticated, driverProfile };
}
