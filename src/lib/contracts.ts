import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, addDays, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';

interface RentalContractData {
  driverName: string;
  driverPhone: string;
  driverEmail?: string;
  vehicleModel: string;
  licensePlate: string;
  rentAmount: number;
  startDate: Date;
  depositAmount?: number;
  contractNumber: string;
}

interface LoanContractData {
  driverName: string;
  driverPhone: string;
  driverEmail?: string;
  loanType: string;
  amountApproved: number;
  interestRate: number;
  termWeeks: number;
  weeklyPayment: number;
  startDate: Date;
  contractNumber: string;
}

export function generateRentalContract(data: RentalContractData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 197, 94); // Primary green
  doc.text('DAM FLOTTE', pageWidth / 2, y, { align: 'center' });
  y += 10;
  
  doc.setFontSize(16);
  doc.setTextColor(33, 33, 33);
  doc.text('CONTRAT DE LOCATION DE VÉHICULE', pageWidth / 2, y, { align: 'center' });
  y += 15;

  // Contract number and date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Contrat N°: ${data.contractNumber}`, 14, y);
  doc.text(`Date: ${format(new Date(), 'dd MMMM yyyy', { locale: fr })}`, pageWidth - 14, y, { align: 'right' });
  y += 15;

  // Section: Parties
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ENTRE LES PARTIES SOUSSIGNÉES:', 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Le Bailleur: DAM Flotte SARL', 14, y);
  y += 5;
  doc.text('Adresse: Abidjan, Côte d\'Ivoire', 14, y);
  y += 8;

  doc.text(`Le Locataire: ${data.driverName}`, 14, y);
  y += 5;
  doc.text(`Téléphone: ${data.driverPhone}`, 14, y);
  if (data.driverEmail) {
    y += 5;
    doc.text(`Email: ${data.driverEmail}`, 14, y);
  }
  y += 15;

  // Section: Vehicle details
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('OBJET DU CONTRAT:', 14, y);
  y += 8;

  const vehicleData = [
    ['Véhicule', data.vehicleModel],
    ['Immatriculation', data.licensePlate],
    ['Type de location', 'Journalière'],
    ['Montant du loyer', `${data.rentAmount.toLocaleString('fr-FR')} FCFA / jour`],
    ['Date de début', format(data.startDate, 'dd MMMM yyyy', { locale: fr })],
  ];

  if (data.depositAmount) {
    vehicleData.push(['Caution', `${data.depositAmount.toLocaleString('fr-FR')} FCFA`]);
  }

  autoTable(doc, {
    startY: y,
    body: vehicleData,
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 80 },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

  // Terms and conditions
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('CONDITIONS GÉNÉRALES:', 14, y);
  y += 8;

  const terms = [
    '1. Le locataire s\'engage à utiliser le véhicule exclusivement pour le transport de passagers via la plateforme Yango.',
    '2. Le locataire est responsable de l\'entretien quotidien du véhicule (carburant, nettoyage).',
    '3. Toute infraction au code de la route est à la charge exclusive du locataire.',
    '4. Le locataire doit signaler immédiatement tout accident ou dommage au véhicule.',
    '5. Le paiement du loyer doit être effectué à l\'avance via Wave.',
    '6. En cas de non-paiement, DAM Flotte se réserve le droit de récupérer le véhicule.',
    '7. La sous-location du véhicule est strictement interdite.',
  ];

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  terms.forEach((term) => {
    const lines = doc.splitTextToSize(term, pageWidth - 28);
    lines.forEach((line: string) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, 14, y);
      y += 5;
    });
    y += 2;
  });

  y += 15;

  // Signatures
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('SIGNATURES:', 14, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.text('Le Bailleur:', 14, y);
  doc.text('Le Locataire:', pageWidth / 2 + 10, y);
  y += 25;

  doc.line(14, y, 80, y);
  doc.line(pageWidth / 2 + 10, y, pageWidth - 14, y);
  y += 5;
  doc.setFontSize(8);
  doc.text('DAM Flotte SARL', 14, y);
  doc.text(data.driverName, pageWidth / 2 + 10, y);

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('DAM Flotte - Votre partenaire de confiance pour la mobilité', pageWidth / 2, footerY, { align: 'center' });

  doc.save(`Contrat_Location_${data.contractNumber}.pdf`);
}

export function generateLoanContract(data: LoanContractData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 197, 94);
  doc.text('DAM FLOTTE', pageWidth / 2, y, { align: 'center' });
  y += 10;
  
  doc.setFontSize(16);
  doc.setTextColor(33, 33, 33);
  doc.text('CONTRAT DE PRÊT', pageWidth / 2, y, { align: 'center' });
  y += 15;

  // Contract number and date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Contrat N°: ${data.contractNumber}`, 14, y);
  doc.text(`Date: ${format(new Date(), 'dd MMMM yyyy', { locale: fr })}`, pageWidth - 14, y, { align: 'right' });
  y += 15;

  // Parties
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ENTRE LES PARTIES SOUSSIGNÉES:', 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Le Prêteur: DAM Flotte SARL', 14, y);
  y += 5;
  doc.text('Adresse: Abidjan, Côte d\'Ivoire', 14, y);
  y += 8;

  doc.text(`L'Emprunteur: ${data.driverName}`, 14, y);
  y += 5;
  doc.text(`Téléphone: ${data.driverPhone}`, 14, y);
  if (data.driverEmail) {
    y += 5;
    doc.text(`Email: ${data.driverEmail}`, 14, y);
  }
  y += 15;

  // Loan details
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('CONDITIONS DU PRÊT:', 14, y);
  y += 8;

  const totalAmount = data.amountApproved * (1 + data.interestRate / 100);
  const endDate = addWeeks(data.startDate, data.termWeeks);

  const loanData = [
    ['Type de prêt', data.loanType],
    ['Montant accordé', `${data.amountApproved.toLocaleString('fr-FR')} FCFA`],
    ['Taux d\'intérêt', `${data.interestRate}%`],
    ['Montant total à rembourser', `${Math.round(totalAmount).toLocaleString('fr-FR')} FCFA`],
    ['Durée', `${data.termWeeks} semaines`],
    ['Paiement hebdomadaire', `${data.weeklyPayment.toLocaleString('fr-FR')} FCFA`],
    ['Date de début', format(data.startDate, 'dd MMMM yyyy', { locale: fr })],
    ['Date de fin prévue', format(endDate, 'dd MMMM yyyy', { locale: fr })],
  ];

  autoTable(doc, {
    startY: y,
    body: loanData,
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 70 },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

  // Payment schedule
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ÉCHÉANCIER DE REMBOURSEMENT:', 14, y);
  y += 8;

  const schedule: string[][] = [];
  let currentDate = data.startDate;
  for (let i = 1; i <= Math.min(data.termWeeks, 12); i++) {
    currentDate = addWeeks(data.startDate, i);
    schedule.push([
      `Semaine ${i}`,
      format(currentDate, 'dd/MM/yyyy', { locale: fr }),
      `${data.weeklyPayment.toLocaleString('fr-FR')} FCFA`,
    ]);
  }

  if (data.termWeeks > 12) {
    schedule.push(['...', '...', '...']);
    schedule.push([
      `Semaine ${data.termWeeks}`,
      format(endDate, 'dd/MM/yyyy', { locale: fr }),
      `${data.weeklyPayment.toLocaleString('fr-FR')} FCFA`,
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Échéance', 'Date', 'Montant']],
    body: schedule,
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94] },
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9 },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

  // Terms
  if (y > 200) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('CONDITIONS GÉNÉRALES:', 14, y);
  y += 8;

  const terms = [
    '1. Le remboursement s\'effectue par prélèvement automatique sur les revenus Yango.',
    '2. Tout retard de paiement entraînera des pénalités de 2% par semaine de retard.',
    '3. Le remboursement anticipé est possible sans frais supplémentaires.',
    '4. En cas de défaut de paiement, DAM Flotte se réserve le droit de récupérer le véhicule.',
    '5. L\'emprunteur s\'engage à maintenir son activité sur la plateforme Yango.',
  ];

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  terms.forEach((term) => {
    const lines = doc.splitTextToSize(term, pageWidth - 28);
    lines.forEach((line: string) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, 14, y);
      y += 5;
    });
    y += 2;
  });

  y += 15;

  // Signatures
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('SIGNATURES:', 14, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.text('Le Prêteur:', 14, y);
  doc.text('L\'Emprunteur:', pageWidth / 2 + 10, y);
  y += 25;

  doc.line(14, y, 80, y);
  doc.line(pageWidth / 2 + 10, y, pageWidth - 14, y);
  y += 5;
  doc.setFontSize(8);
  doc.text('DAM Flotte SARL', 14, y);
  doc.text(data.driverName, pageWidth / 2 + 10, y);

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('DAM Flotte - Votre partenaire de confiance pour la mobilité', pageWidth / 2, footerY, { align: 'center' });

  doc.save(`Contrat_Pret_${data.contractNumber}.pdf`);
}

export function generateContractNumber(prefix: string): string {
  const date = format(new Date(), 'yyyyMMdd');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${date}-${random}`;
}
