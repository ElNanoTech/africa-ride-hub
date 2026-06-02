/**
 * B37 FIX — Single source of truth for score level calculation.
 * EVERY component that displays a tier/level MUST use this function.
 */

export interface ScoreLevelInfo {
  level: string;
  label: string;
  color: string;
  hslColor: string;
}

export function getScoreLevel(score: number): ScoreLevelInfo {
  if (score >= 800) return { level: 'A', label: 'Excellent', color: '#27AE60', hslColor: 'hsl(142, 71%, 45%)' };
  if (score >= 650) return { level: 'B', label: 'Bon', color: '#2980B9', hslColor: 'hsl(204, 64%, 44%)' };
  if (score >= 500) return { level: 'C', label: 'Moyen', color: '#F39C12', hslColor: 'hsl(45, 93%, 47%)' };
  if (score >= 300) return { level: 'D', label: 'Faible', color: '#E67E22', hslColor: 'hsl(25, 95%, 53%)' };
  return { level: 'E', label: 'Très faible', color: '#C0392B', hslColor: 'hsl(0, 84%, 60%)' };
}
