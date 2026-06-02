import type { AccidentSeverity } from '@/lib/sinistres';

export type ConfigurableAccidentSeverity = Exclude<AccidentSeverity, 'UNKNOWN'>;

export type AccidentPenaltyConfig = Record<ConfigurableAccidentSeverity, number>;

export const DEFAULT_ACCIDENT_PENALTIES: AccidentPenaltyConfig = {
  MINOR: -30,
  MODERATE: -75,
  SEVERE: -150,
};

export const DEFAULT_SCORE_TIER_THRESHOLDS = {
  A: 850,
  B: 750,
  C: 650,
  D: 500,
  E: 0,
} as const;

export function normalizeAccidentPenaltyConfig(value: unknown): AccidentPenaltyConfig {
  const candidate = value && typeof value === 'object' ? (value as Partial<Record<ConfigurableAccidentSeverity, unknown>>) : {};

  return {
    MINOR: normalizePenalty(candidate.MINOR, DEFAULT_ACCIDENT_PENALTIES.MINOR),
    MODERATE: normalizePenalty(candidate.MODERATE, DEFAULT_ACCIDENT_PENALTIES.MODERATE),
    SEVERE: normalizePenalty(candidate.SEVERE, DEFAULT_ACCIDENT_PENALTIES.SEVERE),
  };
}

export function clampCreditScore(score: number): number {
  return Math.max(300, Math.min(900, Math.round(score)));
}

export function determineCreditTier(
  score: number,
  thresholds: typeof DEFAULT_SCORE_TIER_THRESHOLDS = DEFAULT_SCORE_TIER_THRESHOLDS,
): string {
  if (score >= thresholds.A) return 'A';
  if (score >= thresholds.B) return 'B';
  if (score >= thresholds.C) return 'C';
  if (score >= thresholds.D) return 'D';
  return 'E';
}

export function getCalculationWeekISO(date = new Date()): string {
  const workingDate = new Date(date);
  const dayOfWeek = workingDate.getUTCDay();
  const diff = workingDate.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  workingDate.setUTCDate(diff);
  workingDate.setUTCHours(0, 0, 0, 0);
  return workingDate.toISOString().split('T')[0];
}

function normalizePenalty(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed >= 0) return fallback;
  return Math.round(parsed);
}