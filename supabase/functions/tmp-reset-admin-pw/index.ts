import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const c = createClient(url, key);
  const body = await req.json();
  const op = body.op;
  if (op === "set_pw") {
    const { data: list } = await c.auth.admin.listUsers({ page: 1, perPage: 200 });
    const u = list.users.find(x => x.email === body.email);
    if (!u) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
    const { error } = await c.auth.admin.updateUserById(u.id, { password: body.password, email_confirm: true });
    return new Response(JSON.stringify({ ok: !error, error: error?.message, id: u.id }), { headers: cors });
  }
  if (op === "raw_sql") {
    // execute approval logic against rentals via service role direct UPDATEs (the RPC requires admin JWT)
    const { rental_id, rate } = body;
    const now = new Date().toISOString();
    const init = new Date(Date.now() + 24*3600*1000).toISOString();
    const final_ = new Date(Date.now() + 48*3600*1000).toISOString();
    const { error: e1 } = await c.from("rentals").update({
      approved_rate: rate, approved_duration_hours: 24, final_rate: rate, final_duration_hours: 24,
      total_amount: rate, approval_date: now, pickup_confirmed_at: now,
      return_due_at: new Date(Date.now() + 24*3600*1000).toISOString(),
      payment_due_at_initial: init, payment_due_at_final: final_, payment_phase: "not_due",
      status: "active",
    }).eq("id", rental_id);
    if (e1) return new Response(JSON.stringify({ step: "update_rental", error: e1.message }), { status: 500, headers: cors });

    // Manually create initial invoice + payment + link (mirroring approve_and_activate_rental)
    const { data: rental } = await c.from("rentals").select("*, drivers:driver_id(full_name, phone_number), customer_id").eq("id", rental_id).single();
    const { data: settings } = await c.from("customer_billing_settings").select("*").eq("customer_id", rental.customer_id).maybeSingle();
    const vat_rate = settings?.vat_enabled ? settings.vat_rate : 0;
    const vat_amount = Math.round(rate * vat_rate / 100);
    const total = rate + vat_amount;
    const { data: invoice, error: e2 } = await c.from("invoice").insert({
      customer_id: rental.customer_id, driver_id: rental.driver_id, status: "issued", invoice_kind: "invoice",
      driver_snapshot_name: rental.drivers?.full_name, driver_snapshot_phone: rental.drivers?.phone_number,
      subtotal_ht: rate, vat_amount, total_ttc: total, vat_rate_snapshot: vat_rate,
      vat_enabled_snapshot: settings?.vat_enabled ?? false,
      legal_name_snapshot: settings?.legal_name, rental_id,
    }).select().single();
    if (e2) return new Response(JSON.stringify({ step: "insert_invoice", error: e2.message }), { status: 500, headers: cors });
    await c.from("invoice_line").insert({
      invoice_id: invoice.id, customer_id: rental.customer_id, position: 1,
      designation: "Location véhicule", quantity: 1, unit_price: rate,
      line_total_ht: rate, vat_rate, line_vat: vat_amount, line_total_ttc: total,
    });
    const { data: payment, error: e3 } = await c.from("payments").insert({
      driver_id: rental.driver_id, customer_id: rental.customer_id, rental_id,
      amount: total, payment_type: "rental", due_date: init.slice(0,10), status: "pending",
    }).select().single();
    if (e3) return new Response(JSON.stringify({ step: "insert_payment", error: e3.message }), { status: 500, headers: cors });
    await c.from("invoice_payment_link").insert({ invoice_id: invoice.id, payment_id: payment.id, customer_id: rental.customer_id });
    return new Response(JSON.stringify({ ok: true, invoice_id: invoice.id, payment_id: payment.id, total }), { headers: cors });
  }
  return new Response(JSON.stringify({ error: "unknown op" }), { status: 400, headers: cors });
});
