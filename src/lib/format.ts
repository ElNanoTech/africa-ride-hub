// DAM Africa - Formatting utilities for Côte d'Ivoire market

/**
 * Format amount in FCFA (West African CFA Franc)
 * Format: XX XXX FCFA
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-CI').format(amount) + ' FCFA';
}

/**
 * Format amount in FCFA without the FCFA suffix
 */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('fr-CI').format(amount);
}

// Match bare YYYY-MM-DD strings (Postgres DATE columns come back as this).
// We must NOT let JS parse these as UTC midnight — on phones set to a
// negative UTC offset that renders the previous calendar day.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a value as a Date while keeping date-only strings anchored to
 * Côte d'Ivoire (Africa/Abidjan = UTC+0) noon, so formatting in any
 * browser timezone still yields the intended calendar day.
 */
function toDisplayDate(date: Date | string): Date {
  if (typeof date !== 'string') return date;
  if (DATE_ONLY_RE.test(date)) {
    // Anchor at 12:00 UTC so every non-extreme timezone renders the same day.
    return new Date(`${date}T12:00:00Z`);
  }
  return new Date(date);
}

/**
 * Format date in French locale
 */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('fr-CI', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Abidjan',
  }).format(toDisplayDate(date));
}

/**
 * Format date short (DD/MM/YYYY)
 */
export function formatDateShort(date: Date | string): string {
  return new Intl.DateTimeFormat('fr-CI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Abidjan',
  }).format(toDisplayDate(date));
}

/**
 * Format date and time
 */
export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('fr-CI', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Abidjan',
  }).format(toDisplayDate(date));
}

/**
 * Format relative time (e.g., "il y a 2 heures")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} jours`;
  
  return formatDateShort(d);
}

/**
 * Validate Ivorian phone number
 * Format: 10 digits starting with 0, or 12-13 digits starting with 225
 */
export function isValidPhoneCI(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return /^0[0-9]{9}$/.test(cleaned) || /^225[0-9]{10}$/.test(cleaned);
}

/**
 * Format phone number for display
 */
export function formatPhoneCI(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('225')) {
    // Format: +225 XX XX XX XX XX
    const local = cleaned.slice(3);
    return `+225 ${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
  }
  if (cleaned.startsWith('0')) {
    // Format: 0X XX XX XX XX
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8, 10)}`;
  }
  return phone;
}

/**
 * Validate Ivorian license plate
 * Format: AB-1234-CI or 1234-AB-01
 */
export function isValidLicensePlateCI(plate: string): boolean {
  return /^[A-Z]{2}-\d{4}-[A-Z]{2}$/.test(plate) || /^\d{4}-[A-Z]{2}-\d{2}$/.test(plate);
}

/**
 * Get tier color class
 */
export function getTierColorClass(tier: string): string {
  const colors: Record<string, string> = {
    A: 'bg-tier-a text-white',
    B: 'bg-tier-b text-white',
    C: 'bg-tier-c text-foreground',
    D: 'bg-tier-d text-white',
    E: 'bg-tier-e text-white',
  };
  return colors[tier] || 'bg-muted text-muted-foreground';
}

/**
 * Get tier text color class
 */
export function getTierTextClass(tier: string): string {
  const colors: Record<string, string> = {
    A: 'text-tier-a',
    B: 'text-tier-b',
    C: 'text-tier-c',
    D: 'text-tier-d',
    E: 'text-tier-e',
  };
  return colors[tier] || 'text-muted-foreground';
}

/**
 * Get status badge classes
 */
export function getStatusClasses(status: string): string {
  const statusMap: Record<string, string> = {
    pending: 'status-pending',
    verified: 'status-verified',
    approved: 'status-approved',
    paid: 'status-paid',
    rejected: 'status-rejected',
    overdue: 'status-overdue',
    active: 'status-active',
    open: 'status-pending',
    in_progress: 'status-active',
    resolved: 'status-verified',
    closed: 'bg-muted text-muted-foreground border-muted',
  };
  return statusMap[status] || 'bg-muted text-muted-foreground';
}

/**
 * Calculate days between two dates
 */
export function daysBetween(start: Date | string, end: Date | string): number {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  const diff = endDate.getTime() - startDate.getTime();
  return Math.ceil(diff / 86400000);
}

/**
 * Calculate score percentage (0-1000 scale)
 */
export function scoreToPercentage(score: number): number {
  return Math.min(100, Math.max(0, (score / 1000) * 100));
}

/**
 * Determine tier from score
 */
export function getTierFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (score >= 800) return 'A';
  if (score >= 650) return 'B';
  if (score >= 500) return 'C';
  if (score >= 300) return 'D';
  return 'E';
}
