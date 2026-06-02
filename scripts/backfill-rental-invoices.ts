/**
 * Backfill — Create invoices/payments for existing rentals without one,
 * and apply driver wallet balance where available.
 *
 * For each rental in (approved, active, paid, return_pending, overdue_return)
 * lacking an invoice (invoice_kind='invoice'), this script:
 *   1. Creates an `invoice` (status=issued) + 1 `invoice_line`.
 *   2. Creates a `payments` row (status=pending).
 *   3. Links them via `invoice_payment_link`.
 *   4. Applies driver wallet balance up to the invoice total → if covered fully,
 *      payments.status flips to paid (which the existing trigger propagates to invoice).
 *
 * Idempotent — relies on uniq_invoice_per_rental.
 *
 * Run:  bun scripts/backfill-rental-invoices.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRY = process.argv.includes("--dry-run");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const ELIGIBLE_STATUSES = ["approved", "active", "paid", "return_pending", "overdue_return"];
const log = (...args: unknown[]) => console.log(...args);

interface RentalRow {
  id: string; status: string; driver_id: string; customer_id: string | null;
  final_rate: number | null; approved_rate: number | null; total_amount: number | null;
  start_date: string | null; payment_due_at_initial: string | null;
}

async function fetchSettings(customerId: string) {
  const { data } = await admin.from("customer_billing_settings")
    .select("vat_enabled, vat_rate, legal_name")
    .eq("customer_id", customerId).maybeSingle();
  return {
    vat_enabled: data?.vat_enabled ?? false,
    vat_rate: Number(data?.vat_rate ?? 0),
    legal_name: data?.legal_name ?? "DAM Africa",
  };
}

async function fetchDriverName(driverId: string): Promise<string> {
  const { data } = await admin.from("drivers").select("full_name").eq("id", driverId).maybeSingle();
  return data?.full_name ?? "Conducteur";
}

async function backfillOne(r: RentalRow) {
  if (!r.customer_id) {
    log("⏭️  skip", r.id, "(no customer)"); return { skipped: true };
  }
  const rate = r.final_rate ?? r.approved_rate ?? r.total_amount ?? 0;
  if (!rate || rate <= 0) {
    log("⏭️  skip", r.id, "(no rate)"); return { skipped: true };
  }

  // Idempotency check
  const { data: existing } = await admin
    .from("invoice").select("id").eq("rental_id", r.id).eq("invoice_kind", "invoice").maybeSingle();
  if (existing) {
    log("✓ already has invoice", r.id, "→", existing.id);
    return { skipped: true };
  }

  const settings = await fetchSettings(r.customer_id);
  const driverName = await fetchDriverName(r.driver_id);

  const subtotal = rate;
  const vat = settings.vat_enabled ? Math.round(subtotal * settings.vat_rate / 100) : 0;
  const total = subtotal + vat;

  if (DRY) {
    log("DRY", r.id, { rate, total, driver: driverName });
    return { dry: true };
  }

  // 1. Invoice
  const { data: inv, error: invErr } = await admin.from("invoice").insert({
    customer_id: r.customer_id,
    driver_id: r.driver_id,
    rental_id: r.id,
    status: "issued",
    invoice_kind: "invoice",
    driver_snapshot_name: driverName,
    subtotal_ht: subtotal,
    vat_amount: vat,
    total_ttc: total,
    vat_rate_snapshot: settings.vat_rate,
    vat_enabled_snapshot: settings.vat_enabled,
    legal_name_snapshot: settings.legal_name,
    notes: "Backfill (location existante)",
  }).select("id, invoice_number").single();
  if (invErr) throw new Error(`invoice ${r.id}: ${invErr.message}`);

  // 2. Invoice line
  await admin.from("invoice_line").insert({
    invoice_id: inv.id,
    customer_id: r.customer_id,
    description: `Location véhicule — ${r.start_date ?? "période active"}`,
    quantity: 1,
    unit_price_ht: subtotal,
    total_ht: subtotal,
  });

  // 3. Payment
  const dueDate = (r.payment_due_at_initial ?? new Date(Date.now() + 86_400_000).toISOString()).slice(0, 10);
  const { data: pay, error: payErr } = await admin.from("payments").insert({
    driver_id: r.driver_id,
    rental_id: r.id,
    customer_id: r.customer_id,
    amount: total,
    payment_type: "rental",
    due_date: dueDate,
    status: "pending",
  }).select("id").single();
  if (payErr) throw new Error(`payment ${r.id}: ${payErr.message}`);

  // 4. Link
  await admin.from("invoice_payment_link").insert({
    invoice_id: inv.id, payment_id: pay.id, customer_id: r.customer_id,
  });

  // 5. Apply wallet
  const { data: wallet } = await admin.from("driver_wallets")
    .select("balance, customer_id").eq("driver_id", r.driver_id).maybeSingle();
  let walletApplied = 0;
  if (wallet && wallet.balance > 0) {
    const apply = Math.min(wallet.balance, total);
    const newBalance = wallet.balance - apply;
    await admin.from("driver_wallets").update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("driver_id", r.driver_id);
    await admin.from("driver_wallet_transactions").insert({
      driver_id: r.driver_id,
      customer_id: r.customer_id,
      rental_id: r.id,
      invoice_id: inv.id,
      payment_id: pay.id,
      type: "rental_invoice_applied",
      amount: -apply,
      balance_after: newBalance,
      method: "wallet",
      reference: inv.invoice_number,
      note: "Backfill auto-application",
    });
    walletApplied = apply;
    if (apply >= total) {
      // Fully covered → mark payment paid (trigger flips invoice to paid)
      await admin.from("payments").update({
        status: "paid",
        paid_date: new Date().toISOString().slice(0, 10),
      }).eq("id", pay.id);
    }
  }

  log("✅", r.id, "→", inv.invoice_number, `total=${total}`, `walletApplied=${walletApplied}`);
  return { ok: true, invoice: inv.invoice_number, walletApplied };
}

(async () => {
  log(`\n🚀 Backfill rental invoices ${DRY ? "(DRY-RUN)" : ""}\n`);
  const { data: rentals, error } = await admin
    .from("rentals")
    .select("id, status, driver_id, customer_id, final_rate, approved_rate, total_amount, start_date, payment_due_at_initial")
    .in("status", ELIGIBLE_STATUSES)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!rentals?.length) { log("No rentals to process."); return; }

  log(`Found ${rentals.length} candidate rentals.\n`);
  let ok = 0, skipped = 0, failed = 0;
  for (const r of rentals as RentalRow[]) {
    try {
      const res = await backfillOne(r);
      if (res?.ok) ok++; else if (res?.skipped) skipped++;
    } catch (e) {
      failed++;
      console.error("❌", r.id, e instanceof Error ? e.message : e);
    }
  }
  log(`\n📊 Done — created: ${ok}, skipped: ${skipped}, failed: ${failed}\n`);

  if (DRY) return;

  // ─────────────── Post-exec coherence checks ───────────────
  console.log("🔍 Contrôles de cohérence post-exécution\n");
  let checksPassed = 0;
  let checksFailed = 0;
  const fail = (msg: string, detail?: unknown) => {
    checksFailed++;
    console.error("❌", msg, detail !== undefined ? JSON.stringify(detail) : "");
  };
  const pass = (msg: string, detail?: unknown) => {
    checksPassed++;
    console.log("✅", msg, detail !== undefined ? JSON.stringify(detail) : "");
  };

  // 1. Idempotence — aucune facture dupliquée par rental_id (kind='invoice')
  const { data: dupes } = await admin.rpc("exec_sql" as never, {} as never).then(
    () => ({ data: null }),
    () => ({ data: null }),
  );
  // Fallback: check via groupby in JS
  const { data: allInvoices } = await admin
    .from("invoice")
    .select("id, rental_id, total_ttc, subtotal_ht, vat_amount, status")
    .eq("invoice_kind", "invoice")
    .not("rental_id", "is", null);

  const byRental = new Map<string, typeof allInvoices>();
  (allInvoices ?? []).forEach((inv) => {
    const arr = byRental.get(inv.rental_id!) ?? [];
    arr.push(inv);
    byRental.set(inv.rental_id!, arr);
  });
  const duplicates = [...byRental.entries()].filter(([, v]) => v!.length > 1);
  if (duplicates.length === 0) {
    pass(`Idempotence — aucune facture dupliquée (${byRental.size} locations facturées)`);
  } else {
    fail(`${duplicates.length} location(s) avec factures dupliquées`, duplicates.map(([r, v]) => ({ rental: r, count: v!.length })));
  }

  // 2. Cohérence montants invoice : subtotal + vat == total
  const badTotals = (allInvoices ?? []).filter(
    (i) => Math.round((i.subtotal_ht ?? 0) + (i.vat_amount ?? 0)) !== Math.round(i.total_ttc ?? 0),
  );
  if (badTotals.length === 0) {
    pass(`Tous les totaux sont cohérents (subtotal + VAT = total)`);
  } else {
    fail(`${badTotals.length} facture(s) avec totaux incohérents`, badTotals.slice(0, 5));
  }

  // 3. Cohérence rental.final_rate ↔ invoice.subtotal_ht
  const { data: rentalsCheck } = await admin
    .from("rentals")
    .select("id, final_rate, approved_rate, total_amount")
    .in("status", ELIGIBLE_STATUSES);
  const rentalRateMap = new Map((rentalsCheck ?? []).map((r) => [r.id, r.final_rate ?? r.approved_rate ?? r.total_amount ?? 0]));
  const rateMismatches = (allInvoices ?? []).filter((i) => {
    const expected = rentalRateMap.get(i.rental_id!);
    return expected !== undefined && Math.round(expected) !== Math.round(i.subtotal_ht ?? 0);
  });
  if (rateMismatches.length === 0) {
    pass(`Tous les subtotaux correspondent au tarif de la location`);
  } else {
    fail(`${rateMismatches.length} facture(s) avec subtotal ≠ tarif location`, rateMismatches.slice(0, 5));
  }

  // 4. Cohérence wallet — pour chaque transaction 'rental_invoice_applied',
  //    montant ≤ total facture, et balance_after = balance_before - |amount|
  const { data: walletTxns } = await admin
    .from("driver_wallet_transactions")
    .select("id, driver_id, invoice_id, amount, balance_after, type, created_at")
    .eq("type", "rental_invoice_applied")
    .order("driver_id")
    .order("created_at");

  const invMap = new Map((allInvoices ?? []).map((i) => [i.id, i]));
  let walletAmountIssues = 0;
  let walletChainIssues = 0;
  const lastBalance = new Map<string, number>(); // driver_id → last balance_after
  for (const tx of walletTxns ?? []) {
    const inv = invMap.get(tx.invoice_id!);
    const applied = Math.abs(tx.amount);
    if (inv && applied > (inv.total_ttc ?? 0)) {
      walletAmountIssues++;
    }
    // Chain check: balance_after should equal previous - applied (when prev exists)
    const prev = lastBalance.get(tx.driver_id);
    if (prev !== undefined && tx.balance_after !== prev - applied) {
      walletChainIssues++;
    }
    lastBalance.set(tx.driver_id, tx.balance_after);
  }
  if (walletAmountIssues === 0) {
    pass(`Toutes les applications wallet ≤ total facture (${walletTxns?.length ?? 0} txns)`);
  } else {
    fail(`${walletAmountIssues} application(s) wallet > total facture`);
  }
  if (walletChainIssues === 0) {
    pass(`Chaîne balance_after cohérente sur toutes les applications wallet`);
  } else {
    fail(`${walletChainIssues} rupture(s) dans la chaîne balance_after`);
  }

  // 5. Cohérence wallet.balance live ↔ dernière transaction
  const { data: wallets } = await admin.from("driver_wallets").select("driver_id, balance");
  let walletLiveIssues = 0;
  for (const w of wallets ?? []) {
    const last = lastBalance.get(w.driver_id);
    if (last !== undefined && w.balance !== last) {
      walletLiveIssues++;
    }
  }
  if (walletLiveIssues === 0) {
    pass(`driver_wallets.balance == dernière transaction (${wallets?.length ?? 0} wallets)`);
  } else {
    fail(`${walletLiveIssues} wallet(s) avec balance != dernière txn`);
  }

  // 6. Paiements pleinement couverts → status=paid
  const { data: links } = await admin.from("invoice_payment_link").select("invoice_id, payment_id");
  const { data: pays } = await admin.from("payments").select("id, amount, status");
  const payMap = new Map((pays ?? []).map((p) => [p.id, p]));
  let unpaidCovered = 0;
  for (const l of links ?? []) {
    const inv = invMap.get(l.invoice_id);
    const pay = payMap.get(l.payment_id);
    if (!inv || !pay) continue;
    // sum applied for this invoice
    const applied = (walletTxns ?? [])
      .filter((t) => t.invoice_id === inv.id)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    if (applied >= (inv.total_ttc ?? 0) && pay.status !== "paid") {
      unpaidCovered++;
    }
  }
  if (unpaidCovered === 0) {
    pass(`Tous les paiements pleinement couverts par wallet sont marqués paid`);
  } else {
    fail(`${unpaidCovered} paiement(s) couvert(s) mais non marqué(s) paid`);
  }

  console.log(`\n📋 Contrôles : ${checksPassed} passés, ${checksFailed} échoués\n`);
  if (checksFailed > 0) process.exitCode = 1;
})();
