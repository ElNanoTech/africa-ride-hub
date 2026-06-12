import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Render one CSV cell: quotes/commas/newlines are escaped, and string values
 * starting with =, +, - or @ are prefixed with a single quote — the standard
 * spreadsheet formula-injection mitigation. Numbers (and other non-strings)
 * are NOT touched, so numeric columns stay numeric in Excel.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let stringValue = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(stringValue)) {
    stringValue = `'${stringValue}`;
  }
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

// CSV Export
export function exportToCSV(data: Record<string, unknown>[], filename: string, headers?: Record<string, string>) {
  if (!data.length) return;

  // Get all keys from the first row or use provided headers
  const keys = Object.keys(headers || data[0]);

  // Create header row
  const headerRow = keys.map(key => csvCell(headers?.[key] || key)).join(',');

  // Create data rows
  const rows = data.map(row =>
    keys.map(key => csvCell(row[key])).join(',')
  );

  const csv = [headerRow, ...rows].join('\n');
  
  // Add BOM for Excel compatibility with French characters
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

// PDF Export for analytics data
export function exportAnalyticsToPDF(
  data: {
    title: string;
    generatedAt: Date;
    stats?: {
      avgScore: number;
      uniqueDrivers: number;
      highPerformers: number;
      atRisk: number;
    };
    trendData?: Array<{
      week: string;
      avgScore: number;
      minScore: number;
      maxScore: number;
      driverCount: number;
    }>;
    tierDistribution?: Array<{
      tier: string;
      label: string;
      count: number;
    }>;
    driversData?: Array<{
      name: string;
      score: number;
      tier: string;
      driving: number;
      payment: number;
      income: number;
    }>;
  },
  filename: string
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(33, 33, 33);
  doc.text(data.title, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;

  // Generated date
  doc.setFontSize(10);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Généré le ${format(data.generatedAt, 'dd MMMM yyyy à HH:mm', { locale: fr })}`,
    pageWidth / 2,
    yPosition,
    { align: 'center' }
  );
  yPosition += 15;

  // Summary stats
  if (data.stats) {
    doc.setFontSize(14);
    doc.setTextColor(33, 33, 33);
    doc.text('Résumé', 14, yPosition);
    yPosition += 8;

    const statsData = [
      ['Score Moyen', String(data.stats.avgScore)],
      ['Conducteurs Évalués', String(data.stats.uniqueDrivers)],
      ['Hautes Performances (A/B)', String(data.stats.highPerformers)],
      ['À Risque (D/E)', String(data.stats.atRisk)],
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [['Métrique', 'Valeur']],
      body: statsData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  }

  // Tier distribution
  if (data.tierDistribution && data.tierDistribution.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(33, 33, 33);
    doc.text('Distribution par Niveau', 14, yPosition);
    yPosition += 8;

    const tierData = data.tierDistribution.map(t => [
      `Niveau ${t.tier}`,
      t.label,
      String(t.count),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Niveau', 'Catégorie', 'Nombre']],
      body: tierData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  }

  // Weekly trend data
  if (data.trendData && data.trendData.length > 0) {
    // Check if we need a new page
    if (yPosition > 200) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(33, 33, 33);
    doc.text('Évolution Hebdomadaire', 14, yPosition);
    yPosition += 8;

    const trendTableData = data.trendData.map(t => [
      t.week,
      String(t.avgScore),
      String(t.minScore),
      String(t.maxScore),
      String(t.driverCount),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Semaine', 'Score Moy.', 'Min', 'Max', 'Conducteurs']],
      body: trendTableData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  }

  // Individual driver data
  if (data.driversData && data.driversData.length > 0) {
    // Check if we need a new page
    if (yPosition > 180) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(33, 33, 33);
    doc.text('Détail par Conducteur', 14, yPosition);
    yPosition += 8;

    const driversTableData = data.driversData.map(d => [
      d.name,
      String(d.score),
      d.tier,
      String(d.driving),
      String(d.payment),
      String(d.income),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Conducteur', 'Score', 'Niveau', 'Conduite', 'Paiement', 'Revenu']],
      body: driversTableData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 9 },
    });
  }

  // Save the PDF
  doc.save(`${filename}.pdf`);
}

// PDF Export for driver detail
export function exportDriverDetailToPDF(
  data: {
    driverName: string;
    generatedAt: Date;
    driverInfo: {
      phone: string;
      email?: string;
      yangoId: string;
      status: string;
      kycStatus: string;
      createdAt: string;
    };
    currentScore?: {
      score: number;
      tier: string;
    };
    scoreHistory?: Array<{
      week: string;
      score: number;
      tier: string;
      driving: number;
      payment: number;
      income: number;
    }>;
    payments?: Array<{
      type: string;
      amount: number;
      dueDate: string;
      status: string;
    }>;
  },
  filename: string
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(33, 33, 33);
  doc.text(`Rapport - ${data.driverName}`, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;

  // Generated date
  doc.setFontSize(10);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Généré le ${format(data.generatedAt, 'dd MMMM yyyy à HH:mm', { locale: fr })}`,
    pageWidth / 2,
    yPosition,
    { align: 'center' }
  );
  yPosition += 15;

  // Driver info
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text('Informations du Conducteur', 14, yPosition);
  yPosition += 8;

  const infoData = [
    ['ID Yango', data.driverInfo.yangoId],
    ['Téléphone', data.driverInfo.phone],
    ['Email', data.driverInfo.email || '-'],
    ['Statut', data.driverInfo.status],
    ['KYC', data.driverInfo.kycStatus],
    ['Inscrit le', data.driverInfo.createdAt],
  ];

  autoTable(doc, {
    startY: yPosition,
    body: infoData,
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
    },
    margin: { left: 14, right: 14 },
  });

  yPosition = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

  // Current score
  if (data.currentScore) {
    doc.setFontSize(14);
    doc.text('Score Actuel', 14, yPosition);
    yPosition += 8;

    autoTable(doc, {
      startY: yPosition,
      body: [
        ['Score', String(data.currentScore.score)],
        ['Niveau', data.currentScore.tier],
      ],
      theme: 'plain',
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
      },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  }

  // Score history
  if (data.scoreHistory && data.scoreHistory.length > 0) {
    doc.setFontSize(14);
    doc.text('Historique des Scores', 14, yPosition);
    yPosition += 8;

    const historyData = data.scoreHistory.map(s => [
      s.week,
      String(s.score),
      s.tier,
      String(s.driving),
      String(s.payment),
      String(s.income),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Semaine', 'Score', 'Niveau', 'Conduite', 'Paiement', 'Revenu']],
      body: historyData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  }

  // Payments
  if (data.payments && data.payments.length > 0) {
    if (yPosition > 200) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.text('Historique des Paiements', 14, yPosition);
    yPosition += 8;

    const paymentsData = data.payments.map(p => [
      p.type,
      `${p.amount.toLocaleString('fr-FR')} FCFA`,
      p.dueDate,
      p.status,
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Type', 'Montant', 'Échéance', 'Statut']],
      body: paymentsData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`${filename}.pdf`);
}

// PDF Export for drivers list
export function exportDriversListToPDF(
  data: {
    title: string;
    generatedAt: Date;
    filters?: string;
    drivers: Array<{
      name: string;
      phone: string;
      kycStatus: string;
      score: number | string;
      tier: string;
      status: string;
      createdAt: string;
    }>;
  },
  filename: string
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(33, 33, 33);
  doc.text(data.title, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;

  // Generated date
  doc.setFontSize(10);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Généré le ${format(data.generatedAt, 'dd MMMM yyyy à HH:mm', { locale: fr })}`,
    pageWidth / 2,
    yPosition,
    { align: 'center' }
  );
  yPosition += 8;

  // Filters applied
  if (data.filters) {
    doc.text(`Filtres: ${data.filters}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;
  }

  yPosition += 5;

  // Summary
  doc.setFontSize(12);
  doc.setTextColor(33, 33, 33);
  doc.text(`Total: ${data.drivers.length} conducteur(s)`, 14, yPosition);
  yPosition += 10;

  // Drivers table
  const driversTableData = data.drivers.map(d => [
    d.name,
    d.phone,
    d.kycStatus,
    String(d.score),
    d.tier,
    d.status,
    d.createdAt,
  ]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Nom', 'Téléphone', 'KYC', 'Score', 'Niveau', 'Statut', 'Inscrit le']],
    body: driversTableData,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] },
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 30 },
      2: { cellWidth: 22 },
      3: { cellWidth: 15 },
      4: { cellWidth: 15 },
      5: { cellWidth: 22 },
      6: { cellWidth: 25 },
    },
  });

  doc.save(`${filename}.pdf`);
}

// Helper to download blob
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}