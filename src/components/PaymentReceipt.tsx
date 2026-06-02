import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Share2, CheckCircle } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface PaymentReceiptProps {
  payment: {
    id: string;
    amount: number;
    amount_paid?: number | null;
    due_date: string;
    paid_date?: string | null;
    status: string;
    payment_type?: string;
    wave_transaction_id?: string | null;
  };
  driverName: string;
  vehicleInfo?: string;
  compact?: boolean;
}

export function PaymentReceipt({ payment, driverName, vehicleInfo, compact = false }: PaymentReceiptProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async (): Promise<jsPDF> => {
    const doc = new jsPDF({ unit: 'mm', format: 'a5' });
    const w = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(34, 197, 94); // primary green
    doc.rect(0, 0, w, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('DAM Flotte', w / 2, 12, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Reçu de paiement', w / 2, 20, { align: 'center' });

    // Receipt content
    doc.setTextColor(30, 30, 30);
    let y = 40;
    
    // Status badge
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    if (payment.status === 'paid') {
      doc.setTextColor(34, 197, 94);
      doc.text('✓ PAYÉ', w / 2, y, { align: 'center' });
    } else if (payment.status === 'overpaid') {
      doc.setTextColor(34, 197, 94);
      doc.text('✓ PAYÉ (TROP-PERÇU)', w / 2, y, { align: 'center' });
    } else {
      doc.setTextColor(239, 68, 68);
      doc.text('EN ATTENTE', w / 2, y, { align: 'center' });
    }
    y += 12;

    // Details
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    const addRow = (label: string, value: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text(label, 15, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(value, w - 15, y, { align: 'right' });
      y += 7;
    };

    // Divider
    doc.setDrawColor(220, 220, 220);
    doc.line(15, y - 3, w - 15, y - 3);
    y += 2;

    addRow('Référence', `PAY-${payment.id.slice(0, 8).toUpperCase()}`);
    addRow('Conducteur', driverName);
    if (vehicleInfo) addRow('Véhicule', vehicleInfo);
    if (payment.payment_type) {
      const typeLabel = payment.payment_type === 'rental' ? 'Location' : payment.payment_type === 'loan' ? 'Prêt' : payment.payment_type;
      addRow('Type', typeLabel);
    }
    addRow('Date d\'échéance', formatDateShort(payment.due_date));
    if (payment.paid_date) addRow('Date de paiement', formatDateShort(payment.paid_date));
    if (payment.wave_transaction_id) addRow('Transaction Wave', payment.wave_transaction_id.slice(0, 12));
    if (payment.status === 'overpaid' && payment.amount_paid) {
      const surplus = Math.max(0, Number(payment.amount_paid) - Number(payment.amount));
      if (surplus > 0) {
        addRow('Reçu', formatCurrency(payment.amount_paid));
        addRow('Trop-perçu (crédit portefeuille)', formatCurrency(surplus));
      }
    }
    
    y += 4;
    doc.setDrawColor(220, 220, 220);
    doc.line(15, y, w - 15, y);
    y += 8;

    // Amount (large)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Montant', 15, y);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(formatCurrency(payment.amount), w - 15, y, { align: 'right' });
    
    y += 16;
    doc.setDrawColor(220, 220, 220);
    doc.line(15, y, w - 15, y);
    y += 8;

    // Footer
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text('DAM Flotte — Côte d\'Ivoire 🇨🇮', w / 2, y, { align: 'center' });
    y += 4;
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, w / 2, y, { align: 'center' });
    y += 4;
    doc.text('Ce reçu est un justificatif de paiement. Conservez-le pour vos archives.', w / 2, y, { align: 'center' });

    return doc;
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const doc = await generatePDF();
      doc.save(`recu-${payment.id.slice(0, 8)}.pdf`);
      toast.success('Reçu téléchargé');
    } catch (e) {
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    setIsGenerating(true);
    try {
      const doc = await generatePDF();
      const blob = doc.output('blob');
      const file = new File([blob], `recu-${payment.id.slice(0, 8)}.pdf`, { type: 'application/pdf' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Reçu de paiement DAM Flotte',
          files: [file],
        });
      } else {
        // Fallback to download
        handleDownload();
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        toast.error('Erreur lors du partage');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (payment.status !== 'paid' && payment.status !== 'overpaid') return null;

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={isGenerating}
        className="gap-1.5 text-xs h-8"
      >
        <Download className="h-3.5 w-3.5" />
        Reçu
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={isGenerating}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        {isGenerating ? 'Génération...' : 'Télécharger le reçu'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        disabled={isGenerating}
        className="gap-2"
      >
        <Share2 className="h-4 w-4" />
        Partager
      </Button>
    </div>
  );
}
