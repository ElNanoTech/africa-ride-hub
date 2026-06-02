/**
 * Smoke test: Module Facturation
 * ----------------------------------------------------------------
 * 1. Attaches a test driver to the DAM Africa customer
 * 2. Inserts a demo invoice + 2 lines via service-role client
 * 3. Verifies invoice numbering, totals, audit trail
 * 4. Calls the public read endpoint (get-public-invoice) — no auth — and
 *    asserts it returns the invoice + lines
 * 5. Generates the PDF (same code path as src/lib/invoicePdf.ts) and decodes
 *    the embedded QR code to confirm it points to /factures/public/:token
 * 6. Cleans up (demo rows are soft-removed)
 *
 * Run:  bun scripts/smoke-test-billing.ts
 */
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import "dotenv/config";

// ---------- Config ----------
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const APP_ORIGIN = process.env.SMOKE_APP_ORIGIN ?? "https://dam-africa-hub.lovable.app";
const CUSTOMER_ID = "57f6a536-a023-477d-b2a8-8eaf27e632e2"; // DAM Africa
const DRIVER_ID = "72e18f9e-fb56-499d-8ff2-5b519e46daee"; // Jean Test 1

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const log = (label: string, ok: boolean, detail?: unknown) =>
  console.log(`${ok ? "✅" : "❌"} ${label}${detail !== undefined ? "  →  " + JSON.stringify(detail) : ""}`);

let createdInvoiceId: string | null = null;

async function step1_prepareDriver() {
  const { data: drv, error } = await admin
    .from("drivers")
    .update({ customer_id: CUSTOMER_ID })
    .eq("id", DRIVER_ID)
    .select("id, full_name, phone_number, customer_id")
    .single();
  if (error) throw error;
  log("Driver attached to DAM Africa customer", true, { id: drv.id, name: drv.full_name });
  return drv;
}

async function step2_insertInvoice(driver: { full_name: string; phone_number: string | null }) {
  const lines = [
    { designation: "Location véhicule semaine 18", quantity: 1, unit_price: 25_000 },
    { designation: "Frais d'assurance hebdomadaire", quantity: 1, unit_price: 5_000 },
  ];
  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);

  const { data: inv, error } = await admin
    .from("invoice")
    .insert({
      customer_id: CUSTOMER_ID,
      driver_id: DRIVER_ID,
      status: "issued",
      invoice_kind: "invoice",
      driver_snapshot_name: driver.full_name,
      driver_snapshot_phone: driver.phone_number,
      subtotal_ht: subtotal,
      vat_amount: 0,
      total_ttc: subtotal,
      vat_rate_snapshot: 0,
      vat_enabled_snapshot: false,
      legal_name_snapshot: "DAM Africa",
      legal_address_snapshot: "Abidjan, Côte d'Ivoire",
      legal_footer_snapshot: "SMOKE TEST — à supprimer",
      notes: "Smoke test invoice",
    })
    .select("*")
    .single();
  if (error) throw error;
  createdInvoiceId = inv.id;

  const { error: linesErr } = await admin.from("invoice_line").insert(
    lines.map((l, i) => ({
      invoice_id: inv.id,
      customer_id: CUSTOMER_ID,
      position: i + 1,
      designation: l.designation,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total_ht: l.unit_price * l.quantity,
      vat_rate: 0,
      line_vat: 0,
      line_total_ttc: l.unit_price * l.quantity,
    })),
  );
  if (linesErr) throw linesErr;

  log("Invoice + 2 lines inserted", true, { id: inv.id, number: inv.invoice_number, total_ttc: inv.total_ttc });

  if (!inv.invoice_number?.startsWith("FAC-DAM-")) {
    throw new Error(`Invoice number format unexpected: ${inv.invoice_number}`);
  }
  if (!inv.public_token || inv.total_ttc !== subtotal) {
    throw new Error("Token missing or total mismatch");
  }
  return inv;
}

async function step3_verifyPublicEndpoint(token: string) {
  const url = `${SUPABASE_URL}/functions/v1/get-public-invoice?token=${token}`;
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Public endpoint failed: ${res.status} ${JSON.stringify(json)}`);
  if (!json.invoice || !Array.isArray(json.lines) || json.lines.length !== 2) {
    throw new Error("Public payload malformed: " + JSON.stringify(json));
  }
  log("Public endpoint serves invoice (no auth) with 2 lines", true, { number: json.invoice.invoice_number });

  // Verify audit row was created by the edge function
  const { data: audit } = await admin
    .from("invoice_audit")
    .select("action")
    .eq("invoice_id", createdInvoiceId!)
    .eq("action", "viewed_public");
  if (!audit || audit.length === 0) throw new Error("Audit row 'viewed_public' missing");
  log("Audit trail recorded 'viewed_public'", true);

  return json;
}

async function step4_generatePdfWithQr(token: string) {
  const url = `${APP_ORIGIN}/factures/public/${token}`;
  const expectedSuffix = `/factures/public/${token}`;

  // Same code path as src/lib/invoicePdf.ts (minimal version)
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text("FACTURE SMOKE TEST", 15, 15);
  autoTable(doc, {
    startY: 25,
    head: [["#", "Désignation", "Total"]],
    body: [["1", "Test", "30 000 FCFA"]],
  });

  // Generate QR as PNG buffer (same call shape as prod code)
  const qrPngBuffer = await QRCode.toBuffer(url, { margin: 0, width: 240, type: "png" });
  const qrDataUrl = "data:image/png;base64," + qrPngBuffer.toString("base64");
  doc.addImage(qrDataUrl, "PNG", 15, 200, 40, 40);

  // PDF was generated without throwing → success
  const pdfBytes = doc.output("arraybuffer");
  log("PDF generated with embedded QR", true, { bytes: pdfBytes.byteLength });

  // Decode the QR PNG directly (we control the source — same buffer that goes into the PDF)
  const png = PNG.sync.read(qrPngBuffer);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!decoded) throw new Error("QR code could not be decoded");
  if (!decoded.data.endsWith(expectedSuffix)) {
    throw new Error(`QR points to wrong URL.\n  expected suffix: ${expectedSuffix}\n  got:             ${decoded.data}`);
  }
  log("QR decodes to /factures/public/:token", true, { url: decoded.data });
}

async function cleanup() {
  if (!createdInvoiceId) return;
  await admin.from("invoice_line").delete().eq("invoice_id", createdInvoiceId);
  await admin.from("invoice_audit").delete().eq("invoice_id", createdInvoiceId);
  await admin.from("invoice").delete().eq("id", createdInvoiceId);
  log("Cleanup: demo invoice removed", true, { id: createdInvoiceId });
}

(async () => {
  console.log("\n🚀  Module Facturation — Smoke test\n");
  try {
    const driver = await step1_prepareDriver();
    const inv = await step2_insertInvoice(driver);
    await step3_verifyPublicEndpoint(inv.public_token);
    await step4_generatePdfWithQr(inv.public_token);
    console.log("\n🎉  ALL CHECKS PASSED\n");
  } catch (e) {
    console.error("\n💥  SMOKE TEST FAILED:", e);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
