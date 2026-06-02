import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { Invoice, InvoiceLine } from "@/types/billing";
import { publicInvoiceUrl, shareableInvoiceUrl } from "@/types/billing";
import { supabase } from "@/integrations/supabase/routeClient";

interface VehicleSnapshot {
  license_plate: string | null;
  model_name: string | null;
  make?: string | null;
  model_year?: number | null;
}

async function fetchVehicleForInvoice(invoice: Invoice): Promise<VehicleSnapshot | null> {
  if (!invoice.rental_id) return null;
  const { data } = await supabase
    .from("rentals")
    .select("vehicles ( license_plate, model_name, make, model_year )")
    .eq("id", invoice.rental_id)
    .maybeSingle();
  const v = (data as { vehicles: VehicleSnapshot | null } | null)?.vehicles ?? null;
  return v;
}

function formatVehicleLine(v: VehicleSnapshot | null): string | null {
  if (!v) return null;
  const parts = [v.make, v.model_name].filter(Boolean).join(" ");
  const tail = v.license_plate ? `(${v.license_plate})` : "";
  const text = [parts, tail].filter(Boolean).join(" ").trim();
  return text || null;
}

// Use a regular space (not the U+202F narrow no-break space that fr-FR's
// toLocaleString emits) — jsPDF's default Helvetica/WinAnsi font cannot
// render U+202F and substitutes it with "/", producing "20/000 FCFA".
const fmt = (n: number) =>
  n.toLocaleString("fr-FR").replace(/\u202F|\u00A0/g, " ") + " FCFA";
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

export async function generateInvoicePDF(invoice: Invoice, lines: InvoiceLine[]): Promise<jsPDF> {
  const vehicle = await fetchVehicleForInvoice(invoice);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(34, 197, 94);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.legal_name_snapshot || "DAM Africa", 15, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (invoice.legal_address_snapshot) doc.text(invoice.legal_address_snapshot, 15, 21);
  const idLines: string[] = [];
  if (invoice.legal_nif_snapshot) idLines.push("NIF: " + invoice.legal_nif_snapshot);
  if (invoice.legal_rccm_snapshot) idLines.push("RCCM: " + invoice.legal_rccm_snapshot);
  if (idLines.length) doc.text(idLines.join("   "), 15, 27);

  // Title block right
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.invoice_kind === "monthly_statement" ? "RELEVÉ MENSUEL" : "FACTURE", pageW - 15, 14, {
    align: "right",
  });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoice_number || "BROUILLON", pageW - 15, 21, { align: "right" });
  doc.text("Émise le : " + fmtDate(invoice.issued_at), pageW - 15, 27, { align: "right" });

  // Status banner if cancelled
  let y = 42;
  if (invoice.status === "cancelled") {
    doc.setFillColor(254, 226, 226);
    doc.rect(15, y, pageW - 30, 10, "F");
    doc.setTextColor(185, 28, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("⚠ FACTURE ANNULÉE — " + (invoice.cancel_reason || ""), pageW / 2, y + 7, { align: "center" });
    y += 14;
  } else if (invoice.status === "paid") {
    doc.setFillColor(220, 252, 231);
    doc.rect(15, y, pageW - 30, 10, "F");
    doc.setTextColor(21, 128, 61);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("✓ PAYÉE le " + fmtDate(invoice.paid_at), pageW / 2, y + 7, { align: "center" });
    y += 14;
  }

  // Bill-to
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Conducteur", 15, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(invoice.driver_snapshot_name || "-", 15, y + 6);
  if (invoice.driver_snapshot_phone) doc.text(invoice.driver_snapshot_phone, 15, y + 12);

  // Vehicle (centre column) — only when the invoice is tied to a rental
  const vehicleLine = formatVehicleLine(vehicle);
  if (vehicleLine) {
    const vx = pageW / 2;
    doc.setFont("helvetica", "bold");
    doc.text("Véhicule", vx, y, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(vehicleLine, vx, y + 6, { align: "center" });
    if (vehicle?.model_year) {
      doc.text(String(vehicle.model_year), vx, y + 12, { align: "center" });
    }
  }

  if (invoice.period_start && invoice.period_end) {
    doc.setFont("helvetica", "bold");
    doc.text("Période", pageW - 15, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(`${fmtDate(invoice.period_start)} → ${fmtDate(invoice.period_end)}`, pageW - 15, y + 6, {
      align: "right",
    });
  }
  y += 22;

  // Tags (optional)
  if (invoice.tags && invoice.tags.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text("Tags :", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(invoice.tags.join(" • "), 28, y, { maxWidth: pageW - 43 });
    y += 8;
  }

  // Lines table
  autoTable(doc, {
    startY: y,
    head: [["#", "Désignation", "Qté", "Prix unit.", "TVA %", "Total HT", "Total TTC"]],
    body: lines.map((l) => [
      String(l.position),
      l.designation,
      String(l.quantity),
      fmt(l.unit_price),
      l.vat_rate.toFixed(2),
      fmt(l.line_total_ht),
      fmt(l.line_total_ttc),
    ]),
    headStyles: { fillColor: [34, 197, 94], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "right" },
      4: { halign: "center", cellWidth: 14 },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  // Totals
  // @ts-expect-error jspdf-autotable adds lastAutoTable
  let ty = (doc.lastAutoTable?.finalY ?? y) + 8;
  const totalsX = pageW - 80;
  const totalsW = 65;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.text("Sous-total HT", totalsX, ty);
  doc.text(fmt(invoice.subtotal_ht), totalsX + totalsW, ty, { align: "right" });
  ty += 6;

  if (invoice.vat_enabled_snapshot) {
    doc.text(`TVA (${(invoice.vat_rate_snapshot ?? 0).toFixed(2)} %)`, totalsX, ty);
    doc.text(fmt(invoice.vat_amount), totalsX + totalsW, ty, { align: "right" });
    ty += 6;
  }
  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(0.5);
  doc.line(totalsX, ty, totalsX + totalsW, ty);
  ty += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text("TOTAL TTC", totalsX, ty);
  doc.text(fmt(invoice.total_ttc), totalsX + totalsW, ty, { align: "right" });

  // QR code
  try {
    const url = publicInvoiceUrl(invoice.public_token);
    const qrData = await QRCode.toDataURL(url, { margin: 0, width: 240 });
    const qrSize = 30;
    doc.addImage(qrData, "PNG", 15, pageH - 50, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.text("Vérifier en ligne :", 15, pageH - 17);
    doc.text(url, 15, pageH - 13, { maxWidth: pageW - 30 });
  } catch (e) {
    console.warn("QR generation failed", e);
  }

  // Footer legal
  if (invoice.legal_footer_snapshot) {
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(invoice.legal_footer_snapshot, pageW - 15, pageH - 8, { align: "right", maxWidth: pageW / 2 });
  }

  return doc;
}

export async function downloadInvoicePDF(invoice: Invoice, lines: InvoiceLine[]) {
  const doc = await generateInvoicePDF(invoice, lines);
  doc.save(`${invoice.invoice_number || "facture"}.pdf`);
}

export async function shareInvoicePDF(invoice: Invoice, lines: InvoiceLine[]) {
  const doc = await generateInvoicePDF(invoice, lines);
  const blob = doc.output("blob");
  const file = new File([blob], `${invoice.invoice_number || "facture"}.pdf`, { type: "application/pdf" });
  // Use the rich-preview URL so WhatsApp/iMessage display invoice details
  // instead of the generic homepage card.
  const shareUrl = shareableInvoiceUrl(invoice.public_token);
  const title = invoice.invoice_number || "Facture";
  const text = `Ma facture DAM Flotte\n${shareUrl}`;
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text, url: shareUrl });
  } else if (navigator.share) {
    await navigator.share({ title, text, url: shareUrl });
  } else {
    doc.save(`${invoice.invoice_number || "facture"}.pdf`);
  }
}
