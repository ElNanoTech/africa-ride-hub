/**
 * Web Biometrics Authentication
 * Uses Web Authentication API (WebAuthn) for fingerprint/Face ID authentication
 * 
 * Note: Support varies by browser and device:
 * - iOS Safari 14+: Touch ID / Face ID
 * - Android Chrome: Fingerprint
 * - Windows Hello: Fingerprint / Face
 * - macOS Safari: Touch ID
 */

import { supabaseDriver as supabase } from '@/integrations/supabase/clients';

// Check if WebAuthn is supported
export function isBiometricsSupported(): boolean {
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );
}

// Check if platform authenticator (built-in biometrics) is available
export async function isBiometricsAvailable(): Promise<boolean> {
  if (!isBiometricsSupported()) return false;
  
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch {
    return false;
  }
}

// Storage key for biometric credentials
const BIOMETRIC_CREDENTIAL_KEY = 'dam_flotte_biometric_credential';
const BIOMETRIC_USER_KEY = 'dam_flotte_biometric_user';

interface StoredBiometricData {
  credentialId: string;
  phoneNumber: string;
  pin: string; // Encrypted PIN stored locally for auto-login
  createdAt: number;
}

// Encrypt PIN for local storage (basic obfuscation - not military-grade but prevents casual viewing)
function obfuscatePin(pin: string, salt: string): string {
  const combined = pin + salt;
  return btoa(combined.split('').reverse().join(''));
}

function deobfuscatePin(obfuscated: string, salt: string): string {
  try {
    const decoded = atob(obfuscated);
    const reversed = decoded.split('').reverse().join('');
    return reversed.replace(salt, '');
  } catch {
    return '';
  }
}

// Check if user has registered biometrics
export function hasBiometricCredential(): boolean {
  const stored = localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
  return !!stored;
}

// Get stored biometric user info
export function getBiometricUserInfo(): { phoneNumber: string } | null {
  const stored = localStorage.getItem(BIOMETRIC_USER_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Generate a random challenge for WebAuthn
function generateChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface BiometricResult {
  success: boolean;
  error?: string;
  phoneNumber?: string;
  pin?: string;
}

/**
 * Register biometrics for a user
 * Must be called after successful PIN login
 */
export async function registerBiometrics(
  phoneNumber: string,
  pin: string
): Promise<BiometricResult> {
  if (!await isBiometricsAvailable()) {
    return { success: false, error: 'Biométrie non disponible sur cet appareil' };
  }

  try {
    const challengeArray = generateChallenge();
    const challengeBuffer = challengeArray.buffer.slice(
      challengeArray.byteOffset,
      challengeArray.byteOffset + challengeArray.byteLength
    ) as ArrayBuffer;
    const userId = new TextEncoder().encode(phoneNumber);
    const userIdBuffer = userId.buffer.slice(
      userId.byteOffset,
      userId.byteOffset + userId.byteLength
    ) as ArrayBuffer;

    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge: challengeBuffer,
      rp: {
        name: 'DAM Flotte',
        id: window.location.hostname,
      },
      user: {
        id: userIdBuffer,
        name: phoneNumber,
        displayName: `Conducteur ${phoneNumber.slice(-4)}`,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Use built-in biometrics
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    }) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: 'Échec de création des identifiants' };
    }

    // Store credential info locally
    const salt = crypto.randomUUID();
    const biometricData: StoredBiometricData = {
      credentialId: arrayBufferToBase64(credential.rawId),
      phoneNumber,
      pin: obfuscatePin(pin, salt),
      createdAt: Date.now(),
    };

    localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, JSON.stringify({ ...biometricData, salt }));
    localStorage.setItem(BIOMETRIC_USER_KEY, JSON.stringify({ phoneNumber }));

    return { success: true };
  } catch (error: any) {
    console.error('Biometric registration error:', error);
    
    if (error.name === 'NotAllowedError') {
      return { success: false, error: 'Accès biométrique refusé' };
    }
    if (error.name === 'InvalidStateError') {
      return { success: false, error: 'Biométrie déjà enregistrée' };
    }
    
    return { success: false, error: error.message || 'Erreur d\'enregistrement biométrique' };
  }
}

/**
 * Authenticate using biometrics
 * Returns the stored credentials for auto-login
 */
export async function authenticateWithBiometrics(): Promise<BiometricResult> {
  if (!await isBiometricsAvailable()) {
    return { success: false, error: 'Biométrie non disponible sur cet appareil' };
  }

  const storedData = localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
  if (!storedData) {
    return { success: false, error: 'Aucune biométrie enregistrée' };
  }

  try {
    const { credentialId, phoneNumber, pin, salt } = JSON.parse(storedData);
    const challengeArray = generateChallenge();
    const challengeBuffer = challengeArray.buffer.slice(
      challengeArray.byteOffset,
      challengeArray.byteOffset + challengeArray.byteLength
    ) as ArrayBuffer;

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge: challengeBuffer,
      allowCredentials: [{
        id: base64ToArrayBuffer(credentialId),
        type: 'public-key',
        transports: ['internal'],
      }],
      userVerification: 'required',
      timeout: 60000,
    };

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    }) as PublicKeyCredential;

    if (!assertion) {
      return { success: false, error: 'Vérification biométrique échouée' };
    }

    // Successfully authenticated with biometrics
    // Return stored credentials for auto-login
    const decodedPin = deobfuscatePin(pin, salt);

    return {
      success: true,
      phoneNumber,
      pin: decodedPin,
    };
  } catch (error: any) {
    console.error('Biometric authentication error:', error);
    
    if (error.name === 'NotAllowedError') {
      return { success: false, error: 'Authentification annulée' };
    }
    
    return { success: false, error: error.message || 'Erreur d\'authentification biométrique' };
  }
}

/**
 * Remove stored biometric credentials
 */
export function removeBiometricCredential(): void {
  localStorage.removeItem(BIOMETRIC_CREDENTIAL_KEY);
  localStorage.removeItem(BIOMETRIC_USER_KEY);
}

/**
 * Get biometrics display name based on platform
 */
export function getBiometricsName(): string {
  const ua = navigator.userAgent.toLowerCase();
  
  if (/iphone|ipad/.test(ua)) {
    // Check for Face ID (iPhone X and later) vs Touch ID
    if (/iphone/.test(ua)) {
      return 'Face ID / Touch ID';
    }
    return 'Touch ID';
  }
  
  if (/android/.test(ua)) {
    return 'Empreinte digitale';
  }
  
  if (/macintosh/.test(ua)) {
    return 'Touch ID';
  }
  
  if (/windows/.test(ua)) {
    return 'Windows Hello';
  }
  
  return 'Biométrie';
}

/**
 * Get appropriate icon name for biometrics
 */
export function getBiometricsIcon(): 'fingerprint' | 'scan-face' | 'shield' {
  const ua = navigator.userAgent.toLowerCase();
  
  if (/iphone/.test(ua)) {
    // iPhone X and later have Face ID
    const match = ua.match(/iphone os (\d+)/);
    if (match && parseInt(match[1]) >= 12) {
      return 'scan-face';
    }
  }
  
  return 'fingerprint';
}
