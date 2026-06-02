/**
 * PIN Strength Validation
 * Prevents common weak PINs for enhanced security
 */

// Common weak PINs to reject
const WEAK_PINS = [
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '2345', '3456', '4567', '5678', '6789', '0123',
  '4321', '5432', '6543', '7654', '8765', '9876', '3210',
  '1212', '2121', '1313', '3131', '1414', '4141',
  '0101', '1010', '2020', '0202',
  '1122', '2233', '3344', '4455', '5566', '6677', '7788', '8899',
  '0011', '1100', '2211', '1221',
  '1357', '2468', '1379', '2580',
  '0007', '0069', '6969',
];

export interface PinValidationResult {
  isValid: boolean;
  error?: string;
  strength: 'weak' | 'medium' | 'strong';
}

/**
 * Check if PIN has all repeated digits (e.g., 1111, 0000)
 */
function hasAllRepeatedDigits(pin: string): boolean {
  return /^(\d)\1{3}$/.test(pin);
}

/**
 * Check if PIN is a simple sequence (ascending or descending)
 */
function isSimpleSequence(pin: string): boolean {
  const digits = pin.split('').map(Number);
  
  // Check ascending sequence (1234)
  const isAscending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  
  // Check descending sequence (4321)
  const isDescending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  
  return isAscending || isDescending;
}

/**
 * Check if PIN has alternating pattern (1212, 2121)
 */
function hasAlternatingPattern(pin: string): boolean {
  if (pin.length !== 4) return false;
  return (pin[0] === pin[2] && pin[1] === pin[3] && pin[0] !== pin[1]);
}

/**
 * Check if PIN has pairs pattern (1122, 3344)
 */
function hasPairsPattern(pin: string): boolean {
  if (pin.length !== 4) return false;
  return (pin[0] === pin[1] && pin[2] === pin[3]);
}

/**
 * Calculate PIN strength
 */
function calculateStrength(pin: string): 'weak' | 'medium' | 'strong' {
  const digits = pin.split('').map(Number);
  const uniqueDigits = new Set(digits).size;
  
  // All same digits = weak
  if (uniqueDigits === 1) return 'weak';
  
  // Only 2 unique digits = medium at best
  if (uniqueDigits === 2) return 'medium';
  
  // 3 unique digits = medium
  if (uniqueDigits === 3) return 'medium';
  
  // 4 unique digits = strong
  return 'strong';
}

/**
 * Validate PIN strength and return detailed result
 */
export function validatePin(pin: string): PinValidationResult {
  // Check length first
  if (!pin || pin.length !== 4) {
    return {
      isValid: false,
      error: 'Le code PIN doit contenir 4 chiffres',
      strength: 'weak',
    };
  }

  // Check if only digits
  if (!/^\d{4}$/.test(pin)) {
    return {
      isValid: false,
      error: 'Le code PIN ne doit contenir que des chiffres',
      strength: 'weak',
    };
  }

  // Check against known weak PINs
  if (WEAK_PINS.includes(pin)) {
    return {
      isValid: false,
      error: 'Ce code PIN est trop courant. Choisissez-en un plus sécurisé.',
      strength: 'weak',
    };
  }

  // Check all repeated digits
  if (hasAllRepeatedDigits(pin)) {
    return {
      isValid: false,
      error: 'Évitez les chiffres répétés (ex: 1111)',
      strength: 'weak',
    };
  }

  // Check simple sequences
  if (isSimpleSequence(pin)) {
    return {
      isValid: false,
      error: 'Évitez les suites simples (ex: 1234, 4321)',
      strength: 'weak',
    };
  }

  // Check alternating patterns
  if (hasAlternatingPattern(pin)) {
    return {
      isValid: false,
      error: 'Évitez les motifs alternés (ex: 1212)',
      strength: 'weak',
    };
  }

  // Check pairs pattern
  if (hasPairsPattern(pin)) {
    return {
      isValid: false,
      error: 'Évitez les motifs en paires (ex: 1122)',
      strength: 'weak',
    };
  }

  // Calculate strength for valid PINs
  const strength = calculateStrength(pin);

  return {
    isValid: true,
    strength,
  };
}

/**
 * Get strength label in French
 */
export function getStrengthLabel(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return 'Faible';
    case 'medium':
      return 'Moyen';
    case 'strong':
      return 'Fort';
  }
}

/**
 * Get strength color class
 */
export function getStrengthColor(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return 'text-destructive';
    case 'medium':
      return 'text-amber-500';
    case 'strong':
      return 'text-green-500';
  }
}
