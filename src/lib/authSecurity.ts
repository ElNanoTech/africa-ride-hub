import { z } from 'zod';
import { checkRateLimit } from './rateLimiter';

/**
 * Password Security Configuration
 * 
 * SECURITY NOTES:
 * - Leaked password protection requires Supabase Pro plan
 * - 2FA/MFA for admin users requires Supabase Pro plan
 * - These features are documented as known limitations for free tier
 * 
 * Current protections implemented:
 * 1. Strong password policy (client-side validation)
 * 2. Rate limiting on auth endpoints (client-side)
 * 3. Password strength meter with feedback
 */

// Password requirements matching enterprise security standards
export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxLength: 128,
};

// Zod schema for strong password validation
export const strongPasswordSchema = z
  .string()
  .min(
    PASSWORD_REQUIREMENTS.minLength,
    `Le mot de passe doit contenir au moins ${PASSWORD_REQUIREMENTS.minLength} caractères`
  )
  .max(
    PASSWORD_REQUIREMENTS.maxLength,
    `Le mot de passe ne peut pas dépasser ${PASSWORD_REQUIREMENTS.maxLength} caractères`
  )
  .refine(
    (password) => !PASSWORD_REQUIREMENTS.requireUppercase || /[A-Z]/.test(password),
    'Le mot de passe doit contenir au moins une majuscule'
  )
  .refine(
    (password) => !PASSWORD_REQUIREMENTS.requireLowercase || /[a-z]/.test(password),
    'Le mot de passe doit contenir au moins une minuscule'
  )
  .refine(
    (password) => !PASSWORD_REQUIREMENTS.requireNumbers || /[0-9]/.test(password),
    'Le mot de passe doit contenir au moins un chiffre'
  )
  .refine(
    (password) =>
      !PASSWORD_REQUIREMENTS.requireSpecialChars || /[!@#$%^&*(),.?":{}|<>]/.test(password),
    'Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*)'
  );

// Email validation schema
export const emailSchema = z
  .string()
  .email('Adresse email invalide')
  .max(255, 'Email trop long');

// Full auth form validation schema
export const authFormSchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
});

// Lighter password schema for login (don't enforce rules on existing passwords)
export const loginPasswordSchema = z
  .string()
  .min(1, 'Le mot de passe est requis')
  .max(PASSWORD_REQUIREMENTS.maxLength, 'Mot de passe trop long');

export const loginFormSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

// Rate limiting configuration for auth endpoints
export const AUTH_RATE_LIMITS = {
  login: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 attempts per minute
  signup: { maxRequests: 3, windowMs: 60 * 1000 }, // 3 signups per minute
  passwordReset: { maxRequests: 3, windowMs: 60 * 1000 }, // 3 resets per minute
  otp: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 OTP requests per minute
};

/**
 * Check rate limit for auth operations
 * Returns true if allowed, false if rate limited
 */
export function checkAuthRateLimit(
  operation: keyof typeof AUTH_RATE_LIMITS,
  identifier: string = 'global'
): { allowed: boolean; remaining: number; resetIn: number } {
  const key = `auth:${operation}:${identifier}`;
  const config = AUTH_RATE_LIMITS[operation];
  return checkRateLimit(key, config);
}

/**
 * Calculate password strength score (0-100)
 */
export function calculatePasswordStrength(password: string): {
  score: number;
  level: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];

  // Length score (up to 30 points)
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;

  // Character variety (up to 40 points)
  if (/[a-z]/.test(password)) score += 10;
  else feedback.push('Ajoutez des minuscules');

  if (/[A-Z]/.test(password)) score += 10;
  else feedback.push('Ajoutez des majuscules');

  if (/[0-9]/.test(password)) score += 10;
  else feedback.push('Ajoutez des chiffres');

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 10;
  else feedback.push('Ajoutez des caractères spéciaux');

  // Pattern penalties
  if (/(.)\1{2,}/.test(password)) {
    score -= 10;
    feedback.push('Évitez les caractères répétés');
  }
  if (/^[0-9]+$/.test(password)) {
    score -= 20;
    feedback.push('N\'utilisez pas que des chiffres');
  }
  if (/^[a-zA-Z]+$/.test(password)) {
    score -= 10;
    feedback.push('Ajoutez des chiffres ou symboles');
  }

  // Common pattern check
  const commonPatterns = ['password', 'qwerty', '123456', 'azerty', 'admin'];
  if (commonPatterns.some((p) => password.toLowerCase().includes(p))) {
    score -= 30;
    feedback.push('Évitez les mots de passe courants');
  }

  // Normalize score
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
  if (score < 30) level = 'weak';
  else if (score < 50) level = 'fair';
  else if (score < 70) level = 'good';
  else if (score < 90) level = 'strong';
  else level = 'excellent';

  return { score, level, feedback };
}

/**
 * Get color for password strength level
 */
export function getStrengthColor(level: string): string {
  switch (level) {
    case 'weak':
      return 'bg-destructive';
    case 'fair':
      return 'bg-orange-500';
    case 'good':
      return 'bg-yellow-500';
    case 'strong':
      return 'bg-green-500';
    case 'excellent':
      return 'bg-emerald-500';
    default:
      return 'bg-muted';
  }
}

/**
 * SECURITY DOCUMENTATION
 * 
 * ## Current Protections (Free Tier)
 * 
 * 1. **Strong Password Policy**
 *    - Minimum 12 characters
 *    - Requires uppercase, lowercase, numbers, and special characters
 *    - Client-side validation with real-time feedback
 * 
 * 2. **Rate Limiting**
 *    - Login: 5 attempts per minute
 *    - Signup: 3 attempts per minute
 *    - Password reset: 3 attempts per minute
 *    - OTP requests: 5 per minute
 * 
 * 3. **Input Validation**
 *    - Zod schema validation for all auth forms
 *    - Email format validation
 *    - Maximum length limits to prevent abuse
 * 
 * ## Requires Supabase Pro Plan
 * 
 * 1. **Leaked Password Protection**
 *    - Checks passwords against known data breaches
 *    - Available in Supabase Pro/Enterprise
 *    - Dashboard: Authentication > Providers > Email > Password protection
 * 
 * 2. **Two-Factor Authentication (2FA/MFA)**
 *    - TOTP-based MFA for admin users
 *    - Available in Supabase Pro/Enterprise
 *    - Recommended for all super_admin and manager roles
 * 
 * 3. **Advanced Rate Limiting**
 *    - Server-side rate limiting at edge
 *    - IP-based blocking for brute force attacks
 *    - Available in Supabase Enterprise
 * 
 * ## Recommended Upgrades
 * 
 * When upgrading to Pro:
 * 1. Enable "Leaked password protection" in Auth settings
 * 2. Enable MFA factors in Auth configuration
 * 3. Implement MFA enrollment flow for admin users
 * 4. Consider enabling Captcha for signup
 */
