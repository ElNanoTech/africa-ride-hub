/**
 * Driver score audit — debugging report.
 *
 * Builds, for every driver, a row containing:
 *   - base score (from platform_settings)
 *   - sum of all driver_score_events.delta
 *   - stored current_score (driver_scores.current_score)
 *   - expected score = clamp(0..1000, base + sum)
 *   - drift = stored - expected (should be 0)
 *
 * Output: an A4 landscape PDF assembled with jsPDF + jspdf-autotable.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/routeClient';

export interface ScoreAuditRow {
  driver_id: string;
  driver_name: string;
  phone_number: string | null;
  base_score: number;
  events_count: number;
  events_sum: number;
  stored_score: number | null;
  expected_score: number;
  drift: number;
}

/**
 * Where the base score value used by the audit came from.
 * - 'platform_settings' : row found and value parsed
 * - 'default'           : row missing → hard-coded fallback (500)
 * - 'default_invalid'   : row found but value could not be parsed
 * - 'default_error'     : query failed (RLS / network / etc.)
 */
export type BaseScoreSource =
  | 'platform_settings'
  | 'default'
  | 'default_invalid'
  | 'default_error';

export interface BaseScoreInfo {
  value: number;
  source: BaseScoreSource;
  setting_key: string;
  raw_value: unknown;
  error_message: string | null;
}

export interface ScoreAuditReport {
  generated_at: string;
  base_score: number;
  base_score_info: BaseScoreInfo;
  drivers_total: number;
  drivers_drifted: number;
  rows: ScoreAuditRow[];
}

const SCORE_MIN = 0;
const SCORE_MAX = 1000;
const DEFAULT_BASE_SCORE = 500;
const BASE_SCORE_KEY = 'base_score';

const clampScore = (value: number) =>
  Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(value)));

async function fetchBaseScore(): Promise<BaseScoreInfo> {
  // The DB function `recompute_driver_current_score` reads `base_score` from
  // platform_settings (setting_key/setting_value jsonb). Fall back to 500 when
  // the row is absent or the value cannot be parsed.
  const { data, error } = await (supabase as any)
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', BASE_SCORE_KEY)
    .maybeSingle();

  if (error) {
    return {
      value: DEFAULT_BASE_SCORE,
      source: 'default_error',
      setting_key: BASE_SCORE_KEY,
      raw_value: null,
      error_message: error.message ?? String(error),
    };
  }

  if (!data) {
    return {
      value: DEFAULT_BASE_SCORE,
      source: 'default',
      setting_key: BASE_SCORE_KEY,
      raw_value: null,
      error_message: null,
    };
  }

  const raw = (data as { setting_value: unknown }).setting_value;
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw)
        : typeof raw === 'object' && raw !== null && 'base' in (raw as Record<string, unknown>)
          ? Number((raw as Record<string, unknown>).base)
          : Number.NaN;

  if (Number.isFinite(parsed)) {
    return {
      value: parsed,
      source: 'platform_settings',
      setting_key: BASE_SCORE_KEY,
      raw_value: raw,
      error_message: null,
    };
  }

  return {
    value: DEFAULT_BASE_SCORE,
    source: 'default_invalid',
    setting_key: BASE_SCORE_KEY,
    raw_value: raw,
    error_message: 'Valeur trouvée mais non numérique',
  };
}

export async function fetchScoreAuditReport(): Promise<ScoreAuditReport> {
  const baseInfo = await fetchBaseScore();
  const baseScore = baseInfo.value;

  const [driversRes, scoresRes, eventsRes] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, full_name, phone_number')
      .order('full_name', { ascending: true }),
    supabase.from('driver_scores').select('driver_id, current_score'),
    supabase.from('driver_score_events').select('driver_id, delta'),
  ]);

  if (driversRes.error) throw driversRes.error;
  if (scoresRes.error) throw scoresRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const drivers = (driversRes.data ?? []) as Array<{
    id: string;
    full_name: string;
    phone_number: string | null;
  }>;

  const scoreMap = new Map<string, number>();
  for (const row of (scoresRes.data ?? []) as Array<{
    driver_id: string;
    current_score: number;
  }>) {
    scoreMap.set(row.driver_id, row.current_score);
  }

  const eventAgg = new Map<string, { count: number; sum: number }>();
  for (const row of (eventsRes.data ?? []) as Array<{ driver_id: string; delta: number }>) {
    const cur = eventAgg.get(row.driver_id) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += row.delta;
    eventAgg.set(row.driver_id, cur);
  }

  const rows: ScoreAuditRow[] = drivers.map((d) => {
    const agg = eventAgg.get(d.id) ?? { count: 0, sum: 0 };
    const stored = scoreMap.get(d.id) ?? null;
    const expected = clampScore(baseScore + agg.sum);
    const drift = stored === null ? 0 : stored - expected;
    return {
      driver_id: d.id,
      driver_name: d.full_name,
      phone_number: d.phone_number,
      base_score: baseScore,
      events_count: agg.count,
      events_sum: agg.sum,
      stored_score: stored,
      expected_score: expected,
      drift,
    };
  });

  const drifted = rows.filter((r) => r.drift !== 0).length;

  return {
    generated_at: new Date().toISOString(),
    base_score: baseScore,
    base_score_info: baseInfo,
    drivers_total: rows.length,
    drivers_drifted: drifted,
    rows,
  };
}

const fmtDate = (iso: string) =>
  format(new Date(iso), "dd/MM/yyyy 'à' HH:mm", { locale: fr });

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const sourceLabel = (source: BaseScoreSource): string => {
  switch (source) {
    case 'platform_settings':
      return 'platform_settings';
    case 'default':
      return 'défaut (clé absente)';
    case 'default_invalid':
      return 'défaut (valeur invalide)';
    case 'default_error':
      return 'défaut (erreur lecture)';
  }
};

const formatRawValue = (raw: unknown): string => {
  if (raw === null || raw === undefined) return '∅';
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
};

export function generateScoreAuditPDF(report: ScoreAuditReport): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Audit des scores conducteurs', 40, 50);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Généré le ${fmtDate(report.generated_at)}`, 40, 68);
  doc.text(
    `Conducteurs : ${report.drivers_total} — Écarts détectés : ${report.drivers_drifted}`,
    40,
    82,
  );

  // Base score provenance line — colored to flag fallback usage
  const info = report.base_score_info;
  const fromSettings = info.source === 'platform_settings';
  doc.setFont('helvetica', 'bold');
  if (fromSettings) {
    doc.setTextColor(39, 174, 96); // green — value came from DB
  } else {
    doc.setTextColor(192, 57, 43); // red — fell back to default
  }
  const provenance = fromSettings
    ? `Base de référence : ${report.base_score} — source : platform_settings.${info.setting_key} (valeur brute : ${formatRawValue(info.raw_value)})`
    : `Base de référence : ${report.base_score} — source : ${sourceLabel(info.source)} [clé recherchée : platform_settings.${info.setting_key}]${
        info.error_message ? ` — ${info.error_message}` : ''
      }`;
  doc.text(provenance, 40, 96);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);


  // Legend
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "Score attendu = max(0, min(1000, base + somme des deltas)). Écart = stocké - attendu (devrait être 0).",
    40,
    112,
  );

  autoTable(doc, {
    startY: 126,
    head: [
      [
        'Conducteur',
        'Téléphone',
        'Base',
        'Évén.',
        'Σ deltas',
        'Stocké',
        'Attendu',
        'Écart',
      ],
    ],
    body: report.rows.map((r) => [
      r.driver_name,
      r.phone_number ?? '—',
      r.base_score,
      r.events_count,
      signed(r.events_sum),
      r.stored_score ?? '—',
      r.expected_score,
      r.drift === 0 ? '0' : signed(r.drift),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [33, 37, 41] },
    columnStyles: {
      0: { cellWidth: 180 },
      1: { cellWidth: 100 },
      2: { halign: 'right', cellWidth: 50 },
      3: { halign: 'right', cellWidth: 50 },
      4: { halign: 'right', cellWidth: 70 },
      5: { halign: 'right', cellWidth: 60 },
      6: { halign: 'right', cellWidth: 60 },
      7: { halign: 'right', cellWidth: 60 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      // Highlight drift column
      if (data.column.index === 7) {
        const raw = String(data.cell.raw ?? '');
        if (raw !== '0') {
          data.cell.styles.textColor = [192, 57, 43];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [253, 237, 236];
        } else {
          data.cell.styles.textColor = [39, 174, 96];
        }
      }
      // Color sum-of-deltas
      if (data.column.index === 4) {
        const raw = String(data.cell.raw ?? '');
        if (raw.startsWith('-')) data.cell.styles.textColor = [192, 57, 43];
        else if (raw.startsWith('+')) data.cell.styles.textColor = [39, 174, 96];
      }
    },
  });

  // Footer
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `DAM Africa — Audit des scores — page ${i}/${total}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 18,
      { align: 'center' },
    );
  }

  return doc;
}

export async function downloadScoreAuditReport(): Promise<ScoreAuditReport> {
  const report = await fetchScoreAuditReport();
  const doc = generateScoreAuditPDF(report);
  const stamp = format(new Date(report.generated_at), 'yyyyMMdd-HHmm');
  doc.save(`score-audit-${stamp}.pdf`);
  return report;
}
