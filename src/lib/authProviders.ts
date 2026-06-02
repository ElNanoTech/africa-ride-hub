/**
 * Auth Provider Abstraction Layer
 * 
 * This module provides a unified interface for different authentication providers,
 * making the driver app independent from any specific provider (Yango, Bolt, etc.)
 * 
 * Provider Independence:
 * - UI remains identical regardless of which provider is used
 * - Business logic is decoupled from provider-specific implementations
 * - Easy to add new providers without changing UI code
 */

import { supabaseDriver as supabase } from '@/integrations/supabase/clients';
import { toast } from 'sonner';
import { seedTestDriverData } from './seedTestData';
import { checkAuthRateLimit } from './authSecurity';

// Provider types
export type AuthProvider = 'native' | 'yango' | 'bolt' | 'uber' | 'test';

export interface AuthProviderConfig {
  id: AuthProvider;
  name: string;
  icon?: string;
  color: string;
  enabled: boolean;
  description: string;
}

// Available providers configuration
export const AUTH_PROVIDERS: Record<AuthProvider, AuthProviderConfig> = {
  native: {
    id: 'native',
    name: 'Connexion native',
    color: 'bg-primary',
    enabled: true,
    description: 'Connexion avec téléphone et code PIN',
  },
  yango: {
    id: 'yango',
    name: 'Yango',
    color: 'bg-[#FF5B00]',
    enabled: true,
    description: 'Connexion via votre compte Yango',
  },
  bolt: {
    id: 'bolt',
    name: 'Bolt',
    color: 'bg-[#34D186]',
    enabled: false, // Disabled by default, can be enabled via feature flag
    description: 'Connexion via votre compte Bolt',
  },
  uber: {
    id: 'uber',
    name: 'Uber',
    color: 'bg-black',
    enabled: false, // Disabled by default
    description: 'Connexion via votre compte Uber',
  },
  test: {
    id: 'test',
    name: 'Mode Test',
    color: 'bg-amber-500',
    enabled: true,
    description: 'Créer un compte test avec données simulées',
  },
};

// Result type for auth operations
export interface AuthResult {
  success: boolean;
  error?: string;
  driverId?: string;
  isNewUser?: boolean;
}

// Provider-specific auth functions
interface ProviderAuthHandler {
  login: (options?: Record<string, unknown>) => Promise<AuthResult>;
  getDisplayName: (yangoId?: string) => string;
}

/**
 * Native Phone + PIN Authentication
 */
async function nativePhoneLogin(phoneNumber: string, pin: string): Promise<AuthResult> {
  // Rate limiting check
  const rateCheck = checkAuthRateLimit('login', phoneNumber);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${Math.ceil(rateCheck.resetIn / 1000)}s`,
    };
  }

  try {
    // Normalize phone number
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const email = `driver_${normalizedPhone}@dam-flotte.local`;
    
    // The PIN acts as a simple password for the driver
    // In production, this would be a proper PIN verification system
    const password = `pin_${pin}_${normalizedPhone}`;

    // Try to sign in
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInData.user) {
      // Enforce suspension at login: if the driver has been suspended,
      // sign out immediately and refuse access.
      const { data: driverRow } = await supabase
        .from('drivers')
        .select('id, driver_status')
        .eq('user_id', signInData.user.id)
        .maybeSingle();

      if (driverRow?.driver_status === 'suspended') {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Votre compte a été suspendu. Contactez votre gestionnaire de flotte.',
        };
      }
      if (driverRow?.driver_status === 'inactive') {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Votre compte est inactif. Contactez votre gestionnaire de flotte.',
        };
      }

      return { success: true, isNewUser: false, driverId: driverRow?.id };
    }

    if (signInError?.message?.includes('Invalid login credentials')) {
      return { success: false, error: 'Code PIN incorrect' };
    }

    throw signInError;
  } catch (error: any) {
    console.error('Native login error:', error);
    return { success: false, error: error.message || 'Erreur de connexion' };
  }
}

/**
 * Native Phone Registration with PIN
 */
async function nativePhoneRegister(
  phoneNumber: string,
  pin: string,
  fullName: string
): Promise<AuthResult> {
  // Rate limiting check
  const rateCheck = checkAuthRateLimit('signup', phoneNumber);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${Math.ceil(rateCheck.resetIn / 1000)}s`,
    };
  }

  try {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const email = `driver_${normalizedPhone}@dam-flotte.local`;
    const password = `pin_${pin}_${normalizedPhone}`;

    // Create user account
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/driver/kyc`,
        data: {
          phone_number: phoneNumber,
          full_name: fullName,
          auth_provider: 'native',
        },
      },
    });

    if (signUpError) {
      if (signUpError.message?.includes('already registered')) {
        return { success: false, error: 'Ce numéro est déjà enregistré' };
      }
      throw signUpError;
    }

    if (!signUpData.user) {
      return { success: false, error: "Erreur lors de l'inscription" };
    }

    // IMPORTANT: Ensure the user is actually signed in.
    // Depending on backend settings, signUp may create the user but not establish a session immediately.
    if (!signUpData.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) throw signInErr;
    }

    // Ensure session is established (safety)
    await supabase.auth.getSession();

    // If a profile already exists (retry scenario), don't insert again
    const { data: existingDriver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', signUpData.user.id)
      .maybeSingle();

    if (existingDriver?.id) {
      return { success: true, isNewUser: false, driverId: existingDriver.id };
    }

    // Create driver profile - kyc_status should be 'not_submitted' initially
    const { data: driverData, error: profileError } = await supabase
      .from('drivers')
      .insert({
        user_id: signUpData.user.id,
        yango_driver_id: `NATIVE_${normalizedPhone}`,
        full_name: fullName,
        phone_number: phoneNumber,
        kyc_status: 'not_submitted', // Not submitted until KYC form is filled
        driver_status: 'active',
      })
      .select('id')
      .single();

    if (profileError) {
      console.error('Error creating driver profile:', profileError);
      return {
        success: false,
        error:
          "Compte créé, mais le profil conducteur n'a pas pu être initialisé. Veuillez vous déconnecter et réessayer (ou contactez le support).",
      };
    }

    return { success: true, isNewUser: true, driverId: driverData?.id };
  } catch (error: any) {
    console.error('Native registration error:', error);
    return { success: false, error: error.message || "Erreur lors de l'inscription" };
  }
}

/**
 * Yango OAuth Login (simulated until API integration)
 */
async function yangoLogin(simulatedYangoId?: string): Promise<AuthResult> {
  const rateCheck = checkAuthRateLimit('login', simulatedYangoId || 'yango');
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${Math.ceil(rateCheck.resetIn / 1000)}s`,
    };
  }

  try {
    const yangoId = simulatedYangoId || `YANGO_${Date.now()}`;
    const email = `driver_${yangoId.toLowerCase()}@dam-africa.local`;
    const password = `yango_auth_${yangoId}_secure`;

    // Try to sign in first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInData.user) {
      return { success: true, isNewUser: false };
    }

    // If sign in fails, create new account
    if (signInError?.message?.includes('Invalid login credentials')) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/driver`,
          data: {
            yango_id: yangoId,
            auth_provider: 'yango',
          },
        },
      });

      if (signUpError) throw signUpError;

      if (signUpData.user) {
        // Create driver profile - kyc_status should be 'not_submitted' initially
        const { data: driverData, error: profileError } = await supabase
          .from('drivers')
          .insert({
            user_id: signUpData.user.id,
            yango_driver_id: yangoId,
            full_name: `Conducteur ${yangoId.slice(-4)}`,
            phone_number: '+225 00 00 00 00',
            kyc_status: 'not_submitted',  // Not submitted until KYC form is filled
            driver_status: 'active',
          })
          .select()
          .single();

        if (profileError) {
          console.error('Error creating driver profile:', profileError);
        }

        return { success: true, isNewUser: true, driverId: driverData?.id };
      }
    } else if (signInError) {
      throw signInError;
    }

    return { success: false, error: 'Erreur de connexion Yango' };
  } catch (error: any) {
    console.error('Yango login error:', error);
    return { success: false, error: error.message || 'Erreur de connexion Yango' };
  }
}

/**
 * Test Mode Login - Creates a test driver with seeded data
 */
async function testModeLogin(): Promise<AuthResult> {
  try {
    const testId = `TEST_DRIVER_${Date.now()}`;
    const email = `driver_${testId.toLowerCase()}@dam-africa.local`;
    const password = `test_auth_${testId}_secure`;

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/driver`,
        data: {
          is_test_driver: true,
          auth_provider: 'test',
        },
      },
    });

    if (signUpError) throw signUpError;

    if (signUpData.user) {
      // Create driver profile
      const { data: driverData, error: profileError } = await supabase
        .from('drivers')
        .insert({
          user_id: signUpData.user.id,
          yango_driver_id: testId,
          full_name: `Test Conducteur ${testId.slice(-4)}`,
          phone_number: '+225 07 00 00 00',
          kyc_status: 'approved', // Test drivers have approved KYC
          driver_status: 'active',
        })
        .select()
        .single();

      if (profileError) {
        console.error('Error creating driver profile:', profileError);
      } else if (driverData) {
        // Seed test data
        toast.info('Création des données de test...');
        await seedTestDriverData(driverData.id);
        toast.success('Compte test créé avec données réalistes!');
      }

      return { success: true, isNewUser: true, driverId: driverData?.id };
    }

    return { success: false, error: 'Erreur lors de la création du compte test' };
  } catch (error: any) {
    console.error('Test mode login error:', error);
    return { success: false, error: error.message || 'Erreur mode test' };
  }
}

/**
 * Phone OTP login is intentionally DISABLED.
 *
 * The previous implementation accepted any 6-digit code without server-side
 * verification, allowing anyone to authenticate or auto-create a driver
 * account with any phone number. This was a critical authentication bypass.
 *
 * Drivers are exclusively admin-provisioned and sign in via phone + PIN.
 * Re-enable only after integrating a real OTP provider (Twilio Verify,
 * Africa's Talking, or Supabase Phone Auth) behind a server-side edge
 * function with rate limiting and short-TTL OTP storage.
 */
async function sendPhoneOTP(_phoneNumber: string): Promise<AuthResult> {
  return {
    success: false,
    error: "La connexion par code SMS est temporairement désactivée. Utilisez votre téléphone et code PIN.",
  };
}

async function verifyPhoneOTP(_phoneNumber: string, _otp: string): Promise<AuthResult> {
  return {
    success: false,
    error: "La connexion par code SMS est temporairement désactivée. Utilisez votre téléphone et code PIN.",
  };
}

/**
 * Send OTP for PIN Reset
 */
async function sendPinResetOTP(phoneNumber: string): Promise<AuthResult> {
  const rateCheck = checkAuthRateLimit('otp', phoneNumber);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${Math.ceil(rateCheck.resetIn / 1000)}s`,
    };
  }

  try {
    // Verify that user exists first
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    
    // Check if driver exists with this phone number
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id, phone_number')
      .or(`phone_number.eq.${phoneNumber},yango_driver_id.eq.NATIVE_${normalizedPhone},yango_driver_id.eq.PHONE_${normalizedPhone}`)
      .maybeSingle();

    if (driverError) {
      console.error('Error checking driver:', driverError);
    }

    if (!driver) {
      return { success: false, error: 'Aucun compte associé à ce numéro' };
    }

    // In production, this would use Twilio via Supabase or a custom edge function
    console.log(`[SIMULATION] PIN Reset OTP sent to ${phoneNumber}`);
    
    // Store the OTP verification state (in production, use a secure backend)
    // For simulation, we'll accept any 6-digit code
    
    return { success: true };
  } catch (error: any) {
    console.error('PIN reset OTP send error:', error);
    return { success: false, error: error.message || 'Erreur d\'envoi du code' };
  }
}

/**
 * Verify OTP and reset PIN
 */
async function verifyAndResetPIN(
  phoneNumber: string,
  otp: string,
  newPin: string
): Promise<AuthResult> {
  const rateCheck = checkAuthRateLimit('login', phoneNumber);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${Math.ceil(rateCheck.resetIn / 1000)}s`,
    };
  }

  try {
    if (otp.length !== 6) {
      return { success: false, error: 'Le code doit contenir 6 chiffres' };
    }

    if (newPin.length !== 4) {
      return { success: false, error: 'Le nouveau PIN doit contenir 4 chiffres' };
    }

    // TODO: In production, verify OTP with backend first
    // For simulation, accept any 6-digit code

    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const oldEmail = `driver_${normalizedPhone}@dam-flotte.local`;
    
    // We need to update the user's password
    // Since we don't have the old password, we'll need to use admin API or a different approach
    // For now, we'll create a new auth entry with the new PIN
    
    // First, try to find the existing auth user by checking if login works with any common old PIN patterns
    // This is a workaround - in production, use Supabase Admin API via edge function
    
    // Create new password hash
    const newPassword = `pin_${newPin}_${normalizedPhone}`;

    // Try to sign up with new credentials (this works if the user was deleted or doesn't exist)
    // For existing users, we need to use update password
    const { data: session } = await supabase.auth.getSession();
    
    if (session?.session) {
      // User is logged in, update their password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Error updating password:', updateError);
        throw updateError;
      }

      return { success: true };
    }

    // User is not logged in - we need to use the admin approach
    // For simulation, we'll sign them in with a temporary approach
    // In production, this would use an edge function with service role key

    // Try common old PINs to get temporary access (simulation only)
    const commonPins = ['0000', '1234', '1111', '2222'];
    let authenticated = false;

    for (const oldPin of commonPins) {
      const oldPassword = `pin_${oldPin}_${normalizedPhone}`;
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: oldEmail,
        password: oldPassword,
      });

      if (signInData.user) {
        authenticated = true;
        // Now update the password
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          console.error('Error updating password:', updateError);
          await supabase.auth.signOut();
          throw updateError;
        }

        // Sign out and let them log in with new PIN
        await supabase.auth.signOut();
        break;
      }
    }

    if (!authenticated) {
      // For simulation: if we can't find the user with common PINs,
      // we'll reset by creating a new account
      // In production, use admin API
      
      return { 
        success: false, 
        error: 'Veuillez contacter le support pour réinitialiser votre PIN.' 
      };
    }

    toast.success('PIN réinitialisé avec succès!');
    return { success: true };
  } catch (error: any) {
    console.error('PIN reset error:', error);
    return { success: false, error: error.message || 'Erreur de réinitialisation' };
  }
}

// Exported provider interface
export const authProviders = {
  native: {
    login: nativePhoneLogin,
    register: nativePhoneRegister,
  },
  yango: {
    login: yangoLogin,
  },
  test: {
    login: testModeLogin,
  },
  otp: {
    send: sendPhoneOTP,
    verify: verifyPhoneOTP,
  },
  pinReset: {
    sendOTP: sendPinResetOTP,
    verifyAndReset: verifyAndResetPIN,
  },
};

/**
 * Get enabled providers based on feature flags
 */
export function getEnabledProviders(): AuthProviderConfig[] {
  // TODO: Check feature flags from database
  return Object.values(AUTH_PROVIDERS).filter((p) => p.enabled);
}
