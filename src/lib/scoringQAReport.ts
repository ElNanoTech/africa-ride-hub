/**
 * Scoring QA — generates a one-click PDF report for a date range.
 *
 * Calls the SECURITY DEFINER db function `get_scoring_qa_report(start, end)`,
 * which returns:
 *   - summary  : windowed counts and net deltas
 *   - drivers  : per-driver aggregated changes (with current score)
 *   - events   : every score event with accident context
 *   - cron     : pg_cron run history for scoring-related jobs
 *
 * Output: an A4 PDF assembled with jsPDF + jspdf-autotable.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/routeClient';

export interface ScoringQAReport {
  summary: {
    window_start: string;
    window_end: string;
    drivers_affected: number;
    events_total: number;
    total_negative_delta: number;
    total_positive_delta: number;
    cron_runs: number;
    cron_failures: number;
  };
  drivers: Array<{
    driver_id: string;
    driver_name: string;
    phone_number: string | null;
    current_score: number | null;
    net_delta: number;
    event_count: number;
    first_event_at: string;
    last_event_at: string;
  }>;
  events: Array<{
    id: string;
    driver_id: string;
    driver_name: string;
    delta: number;
    reason: string;
    created_at: string;
    case_number: string | null;
    accident_severity: string | null;
    accident_status: string | null;
  }>;
  cron: Array<{
    jobname: string;
    schedule: string;
    active: boolean;
    expected_at: string | null;
    end_time: string | null;
    status: string | null;
    return_message: string | null;
    duration_seconds: number | null;
  }>;
}

export async function fetchScoringQAReport(
  startISO: string,
  endISO: string,
): Promise<ScoringQAReport> {
  const { data, error } = await (supabase.rpc as any)('get_scoring_qa_report', {
    p_start: startISO,
    p_end: endISO,
  });
  if (error) throw error;
  return data as ScoringQAReport;
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: fr }) : '—';

export function generateScoringQAPDF(report: ScoringQAReport): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // --- Header ---
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Rapport QA Scoring', 40, 50);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(
    `Période : ${fmtDate(report.summary.window_start)}  →  ${fmtDate(report.summary.window_end)}`,
    40,
    68,
  );
  doc.text(`Généré le ${fmtDate(new Date().toISOString())}`, 40, 82);

  // --- Summary box ---
  const sx = 40;
  let sy = 100;
  doc.setDrawColor(220);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(sx, sy, pageWidth - 80, 70, 4, 4, 'FD');
  doc.setTextColor(33);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');

  const stats: Array<[string, string]> = [
    ['Conducteurs impactés', String(report.summary.drivers_affected)],
    ['Événements de score', String(report.summary.events_total)],
    ['Δ négatif cumulé', String(report.summary.total_negative_delta)],
    ['Δ positif cumulé', `+${report.summary.total_positive_delta}`],
    ['Exécutions cron', String(report.summary.cron_runs)],
    ['Échecs cron', String(report.summary.cron_failures)],
  ];
  stats.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = sx + 14 + col * ((pageWidth - 108) / 3);
    const y = sy + 22 + row * 26;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(110);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(33);
    doc.text(value, x, y + 14);
  });

  // --- Drivers table ---
  let cursorY = sy + 90;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33);
  doc.text('Conducteurs avec changement de score', 40, cursorY);
  cursorY += 8;

  if (report.drivers.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Aucun conducteur impacté sur la période.', 40, cursorY + 14);
    cursorY += 28;
  } else {
    autoTable(doc, {
      startY: cursorY + 6,
      head: [['Conducteur', 'Téléphone', 'Score actuel', 'Δ net', 'Évén.', 'Dernier']],
      body: report.drivers.map((d) => [
        d.driver_name,
        d.phone_number ?? '—',
        d.current_score ?? '—',
        d.net_delta > 0 ? `+${d.net_delta}` : String(d.net_delta),
        d.event_count,
        fmtDate(d.last_event_at),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [33, 37, 41] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw ?? '');
          if (raw.startsWith('-')) data.cell.styles.textColor = [192, 57, 43];
          else if (raw.startsWith('+')) data.cell.styles.textColor = [39, 174, 96];
        }
      },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 16;
  }

  // --- Events table ---
  if (cursorY > 720) {
    doc.addPage();
    cursorY = 50;
  }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Événements de score (détail)', 40, cursorY);
  cursorY += 8;

  if (report.events.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Aucun événement de score sur la période.', 40, cursorY + 14);
    cursorY += 28;
  } else {
    autoTable(doc, {
      startY: cursorY + 6,
      head: [['Date', 'Conducteur', 'Δ', 'Cas', 'Gravité', 'Statut', 'Raison']],
      body: report.events.map((e) => [
        fmtDate(e.created_at),
        e.driver_name,
        e.delta > 0 ? `+${e.delta}` : String(e.delta),
        e.case_number ?? '—',
        e.accident_severity ?? '—',
        e.accident_status ?? '—',
        e.reason,
      ]),
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      columnStyles: { 6: { cellWidth: 130 } },
      headStyles: { fillColor: [33, 37, 41] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const raw = String(data.cell.raw ?? '');
          if (raw.startsWith('-')) data.cell.styles.textColor = [192, 57, 43];
          else if (raw.startsWith('+')) data.cell.styles.textColor = [39, 174, 96];
        }
      },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 16;
  }

  // --- Cron health table ---
  if (cursorY > 700) {
    doc.addPage();
    cursorY = 50;
  }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33);
  doc.text('Santé des tâches planifiées (cron)', 40, cursorY);
  cursorY += 8;

  if (report.cron.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      'Aucune exécution de tâche planifiée trouvée sur la période (ou cron inaccessible).',
      40,
      cursorY + 14,
    );
  } else {
    autoTable(doc, {
      startY: cursorY + 6,
      head: [['Tâche', 'Planning', 'Active', 'Démarrée', 'Statut', 'Durée (s)']],
      body: report.cron.map((c) => [
        c.jobname,
        c.schedule,
        c.active ? 'oui' : 'non',
        fmtDate(c.expected_at),
        c.status ?? '—',
        c.duration_seconds ?? '—',
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [33, 37, 41] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = String(data.cell.raw ?? '').toLowerCase();
          if (raw && raw !== 'succeeded' && raw !== '—') {
            data.cell.styles.textColor = [192, 57, 43];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
  }

  // --- Footer page numbers ---
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `DAM Africa — Scoring QA — page ${i}/${total}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 18,
      { align: 'center' },
    );
  }

  return doc;
}

export async function downloadScoringQAReport(startISO: string, endISO: string): Promise<void> {
  const report = await fetchScoringQAReport(startISO, endISO);
  const doc = generateScoringQAPDF(report);
  const start = format(new Date(startISO), 'yyyyMMdd');
  const end = format(new Date(endISO), 'yyyyMMdd');
  doc.save(`scoring-qa-${start}-${end}.pdf`);
}
