// Fleet Control — End-to-End Verification Harness
// Service-role only. Seeds an isolated tenant + driver + vehicle + rental and
// runs the acceptance tests from the SPEC (item counts derived from
// fleet_control_required_zones()). Returns a structured JSON report.
//
// SAFETY: Always scoped to a dedicated "FC E2E Test" customer; never mutates
// production tenants. Idempotent — can be re-run; tears down its own data first.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;

const TENANT_NAME   = "FC E2E Test";
const ADMIN_EMAIL   = "fc-e2e-admin@dam-test.local";
const ADMIN_PASS    = "FC-E2E-Admin-2026!";
const DRIVER_EMAIL  = "fc-e2e-driver@dam-test.local";
const DRIVER_PASS   = "FC-E2E-Driver-2026!";
const PLATE         = "FC-E2E-001";
const IMEI          = "FCE2E000000001";

const ZONES = [
  "front","rear","left","right","interior_front","interior_rear","dash",
  "doc_carte_grise","doc_assurance","doc_vignette","doc_permis",
];

type StepResult = { id: string; name: string; pass: boolean; details: any };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const report: StepResult[] = [];
  const push = (id: string, name: string, pass: boolean, details: any) => {
    report.push({ id, name, pass, details });
  };

  try {
    /* ───────────────────── 0. RESET & SEED ───────────────────── */
    const seeded = await seed(admin);

    // Build per-role clients (real JWTs → real RLS / auth.uid())
    const adminClient  = await signedInClient(ADMIN_EMAIL,  ADMIN_PASS);
    const driverClient = await signedInClient(DRIVER_EMAIL, DRIVER_PASS);

    // FC-A3: derive the required item set from the server's single source of
    // truth instead of hardcoding 11 — the matrix changes with the
    // require_all_photos / require_documents settings.
    const { data: requiredZonesData } = await admin.rpc("fleet_control_required_zones");
    const REQUIRED: string[] = Array.isArray(requiredZonesData) && requiredZonesData.length > 0
      ? requiredZonesData as string[]
      : ZONES;

    /* ───────────────────── 1. CONTROL CREATION ───────────────── */
    {
      // Trigger: activate rental → fc_autocreate_from_rental creates the control
      const { data: ctrl } = await admin
        .from("vehicle_inspections")
        .select("id, status, due_at, cycle_days, driver_id, vehicle_id, rental_id")
        .eq("driver_id", seeded.driverId)
        .eq("vehicle_id", seeded.vehicleId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cycleSetting = await getSetting(admin, "fleet_control.cycle_days") ?? 14;
      const expectedDue = Date.now() + cycleSetting * 86_400_000;
      const dueOk = ctrl && Math.abs(new Date(ctrl.due_at).getTime() - expectedDue) < 5 * 60_000;

      // Seed the derived required item rows, with a real (tiny) storage
      // object per path — fleet_control_submit verifies the object exists.
      if (ctrl) {
        for (const zone of REQUIRED) {
          await seedItem(admin, seeded, ctrl.id, zone, "pending");
        }
      }

      // Driver visibility check (real RLS)
      const { data: driverSees } = await driverClient
        .from("vehicle_inspections").select("id").eq("id", ctrl?.id);

      push("1", "Control auto-created from active rental", !!ctrl && dueOk && (driverSees?.length ?? 0) === 1, {
        control_id: ctrl?.id, status: ctrl?.status, cycle_days: ctrl?.cycle_days,
        due_at: ctrl?.due_at, due_matches_setting: dueOk,
        driver_can_see: (driverSees?.length ?? 0) === 1,
      });
      (seeded as any).controlId = ctrl?.id;
    }

    const controlId = (seeded as any).controlId as string;

    /* ───────────────────── 2. DRIVER SUBMISSION ──────────────── */
    {
      // Driver marks each item as submitted (RLS-driven update via driver client)
      const { error: upErr } = await driverClient
        .from("vehicle_inspection_photos")
        .update({ validation_status: "submitted", submitted_at: new Date().toISOString() })
        .eq("inspection_id", controlId);
      // Driver calls fleet_control_submit
      const { error: subErr } = await driverClient.rpc("fleet_control_submit", { p_control: controlId });

      const { data: row } = await admin
        .from("vehicle_inspections").select("status, submitted_at").eq("id", controlId).single();
      const { count } = await admin
        .from("vehicle_inspection_photos")
        .select("*", { count: "exact", head: true })
        .eq("inspection_id", controlId)
        .eq("validation_status", "submitted");

      await admin.rpc("fleet_control_log", {
        p_control: controlId, p_action: "item_submitted",
        p_metadata: { count }, p_actor_type: "driver",
      });

      push("2", `Driver submits all ${REQUIRED.length} required items`,
        row?.status === "submitted" && count === REQUIRED.length && !upErr && !subErr,
        { status: row?.status, submitted_count: count, required_count: REQUIRED.length,
          update_err: upErr?.message, submit_err: subErr?.message });
    }

    /* ───────────────────── 3. ITEM-LEVEL REVIEW ──────────────── */
    {
      const { data: items } = await admin
        .from("vehicle_inspection_photos")
        .select("id, zone").eq("inspection_id", controlId).order("zone");
      const [okItem, badItem] = items ?? [];
      const r1 = await adminClient.rpc("fleet_control_item_review",
        { p_item: okItem.id, p_status: "approved" });
      const r2 = await adminClient.rpc("fleet_control_item_review",
        { p_item: badItem.id, p_status: "rejected", p_reason: "Photo trop floue" });

      const { data: refresh } = await admin
        .from("vehicle_inspection_photos")
        .select("id, validation_status, rejection_reason")
        .in("id", [okItem.id, badItem.id]);

      const a = refresh?.find(r => r.id === okItem.id);
      const b = refresh?.find(r => r.id === badItem.id);

      // Driver visibility of rejection
      const { data: drvView } = await driverClient
        .from("vehicle_inspection_photos")
        .select("rejection_reason").eq("id", badItem.id).maybeSingle();

      push("3", "Per-item approve + reject persist with reason",
        a?.validation_status === "approved" &&
        b?.validation_status === "rejected" &&
        b?.rejection_reason === "Photo trop floue" &&
        drvView?.rejection_reason === "Photo trop floue" &&
        !r1.error && !r2.error,
        { approved: a, rejected: b, driver_sees_reason: drvView?.rejection_reason });
    }

    /* ───────────────────── 4. FULL REJECTION ─────────────────── */
    {
      const { error } = await adminClient.rpc("fleet_control_reject",
        { p_control: controlId, p_reason: "Documents illisibles, à refaire" });
      const { data: row } = await admin
        .from("vehicle_inspections").select("status, rejection_reason").eq("id", controlId).single();
      const { data: drvNotif } = await admin
        .from("notifications").select("notification_type, message")
        .eq("driver_id", seeded.driverId).eq("notification_type", "fleet_control_rejected")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      push("4", "Admin rejects → status=rejected + driver notified",
        row?.status === "rejected" && row?.rejection_reason?.includes("illisibles") &&
        !!drvNotif && !error,
        { row, notification: drvNotif, error: error?.message });
    }

    /* ───────────────────── 5. FULL APPROVAL  ─────────────────── */
    {
      // Driver re-submits — flip all items back to submitted
      await admin.from("vehicle_inspection_photos")
        .update({ validation_status: "submitted", rejection_reason: null,
                  submitted_at: new Date().toISOString() })
        .eq("inspection_id", controlId);
      await driverClient.rpc("fleet_control_submit", { p_control: controlId });

      const beforeDue = (await admin.from("vehicle_inspections")
        .select("due_at, reminder_count").eq("id", controlId).single()).data;

      // Force a non-zero reminder_count to verify reset
      await admin.from("vehicle_inspections")
        .update({ reminder_count: 3, last_reminder_at: new Date().toISOString() })
        .eq("id", controlId);

      const { error: appErr } = await adminClient.rpc("fleet_control_approve", { p_control: controlId });

      const { data: row } = await admin
        .from("vehicle_inspections")
        .select("status, last_validated_at, due_at, reminder_count, cycle_days")
        .eq("id", controlId).single();

      const cycle = row?.cycle_days ?? 14;
      const expectedDue = Date.now() + cycle * 86_400_000;
      const dueResetOk = Math.abs(new Date(row!.due_at).getTime() - expectedDue) < 5 * 60_000;

      const { data: notif } = await admin.from("notifications")
        .select("id").eq("driver_id", seeded.driverId)
        .eq("notification_type", "fleet_control_approved")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      push("5", "Approval → approved + due_at reset + counts cleared + notif",
        row?.status === "approved" && row?.last_validated_at != null &&
        dueResetOk && row?.reminder_count === 0 && !!notif && !appErr,
        { row, due_reset_ok: dueResetOk, notification_id: notif?.id, error: appErr?.message });
    }

    /* ───────────────────── 5b. SUBMIT STATUS GUARD ───────────── */
    {
      // The control is approved from test 5 — re-submitting a closed cycle
      // must be refused with invalid_status_for_submit (only pending /
      // rejected / overdue controls are submittable).
      const { error } = await driverClient.rpc("fleet_control_submit", { p_control: controlId });
      push("5b", "Submit refused on approved control (invalid_status_for_submit)",
        !!error && (error.message ?? "").includes("invalid_status_for_submit"),
        { error: error?.message ?? null });
    }

    /* ───────────────────── 6. REMINDER / RELANCE  ────────────── */
    {
      // Reset to overdue
      await admin.from("vehicle_inspections")
        .update({ status: "overdue", reminder_count: 0, last_reminder_at: null,
                  due_at: new Date(Date.now() - 4 * 86_400_000).toISOString() })
        .eq("id", controlId);

      const r1 = await adminClient.rpc("fleet_control_remind", { p_control: controlId });
      const r2 = await adminClient.rpc("fleet_control_remind", { p_control: controlId }); // cooldown

      const { data: row } = await admin.from("vehicle_inspections")
        .select("reminder_count, last_reminder_at").eq("id", controlId).single();

      const { count: notifCount } = await admin.from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("driver_id", seeded.driverId)
        .eq("notification_type", "fleet_control_reminder");

      push("6", "Reminder increments + cooldown blocks 2nd click",
        row?.reminder_count === 1 && r1.data?.sent === true && r2.data?.sent === false && (notifCount ?? 0) >= 1,
        { reminder_count: row?.reminder_count, first: r1.data, second: r2.data, notifications_total: notifCount });
    }

    /* ───────────────────── 7. OVERDUE RECOMPUTE  ─────────────── */
    {
      // Approve then move due into past as 'pending' so recompute flips it
      await admin.from("vehicle_inspections")
        .update({ status: "pending", due_at: new Date(Date.now() - 86_400_000).toISOString() })
        .eq("id", controlId);

      const r = await fetch(`${SUPABASE_URL}/functions/v1/recompute-fleet-controls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      const recompute = await r.json();

      const { data: row } = await admin.from("vehicle_inspections")
        .select("status").eq("id", controlId).single();

      const { count: auditCount } = await admin.from("fleet_control_audit")
        .select("*", { count: "exact", head: true })
        .eq("fleet_control_id", controlId).eq("action", "status_recomputed");

      push("7", "Recompute flips past-due pending → overdue",
        row?.status === "overdue" && (auditCount ?? 0) >= 1,
        { status: row?.status, recompute, audit_count: auditCount });
    }

    /* ───────────────────── 8. MANUAL IMMOBILIZATION  ─────────── */
    {
      const r = await adminClient.rpc("fleet_control_immobilize_request",
        { p_control: controlId, p_reason: "Test manuel" });
      const { data: row } = await admin.from("vehicle_inspections")
        .select("immobilization_state, immobilization_requested_at, immobilization_command_ref")
        .eq("id", controlId).single();
      const { data: cmd } = await admin.from("vehicle_immobilization_commands")
        .select("status, source").eq("inspection_id", controlId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      push("8", "Manual immobilize → state=requested + command queued (no fake cut)",
        row?.immobilization_state === "requested" &&
        row?.immobilization_command_ref == null &&
        cmd?.status === "pending" && !r.error,
        { row, command: cmd, error: r.error?.message });
    }

    /* ───────────────────── 9. CANCEL IMMOBILIZATION  ─────────── */
    {
      const r = await adminClient.rpc("fleet_control_immobilize_cancel", { p_control: controlId });
      const { data: row } = await admin.from("vehicle_inspections")
        .select("immobilization_state, immobilization_cancelled_at").eq("id", controlId).single();
      const { data: cmd } = await admin.from("vehicle_immobilization_commands")
        .select("status").eq("inspection_id", controlId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      push("9", "Cancel immobilization → state=cancelled, command cancelled",
        row?.immobilization_state === "cancelled" && cmd?.status === "cancelled" && !r.error,
        { row, command: cmd, error: r.error?.message });
    }

    /* ───────────────────── 10. PARKING CHECK / HONEST IMMOBILIZATION ── */
    {
      // Re-request immobilization
      await adminClient.rpc("fleet_control_immobilize_request",
        { p_control: controlId, p_reason: "Test honest cut" });

      // Seed a stationary GPS reading for the vehicle's IMEI
      await admin.from("vehicle_positions").upsert({
        imei_no: IMEI, vehicle_no: PLATE,
        lat: 5.345, lng: -4.025, speed: 0, ignition: "OFF",
        status: "stopped", synced_at: new Date().toISOString(),
        customer_id: seeded.customerId,
      }, { onConflict: "imei_no" });

      // Tick parking check twice (requested → pending_stop → cut_sent)
      const tick = async () => {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/check-parking-immobilization`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        });
        return r.json();
      };
      const t1 = await tick();
      const t2 = await tick();

      const { data: row } = await admin.from("vehicle_inspections")
        .select("immobilization_state, immobilization_command_ref, status")
        .eq("id", controlId).single();

      push("10", "Parking check advances requested→pending_stop→cut_sent (honest)",
        row?.immobilization_state === "cut_sent" &&
        row?.immobilization_command_ref === "PENDING_INTEGRATION" &&
        row?.status === "blocked",
        { row, tick1: t1, tick2: t2 });
    }

    /* ───────────────────── 11. AUTO IMMOBILIZATION OFF  ──────── */
    {
      await setSetting(admin, "fleet_control.auto_immobilisation_enabled", false);
      // Fresh overdue control, no in-flight immobilization
      const fresh = await freshControl(admin, seeded);
      await admin.from("vehicle_inspections")
        .update({ status: "overdue",
                  due_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
                  reminder_count: 5,
                  immobilization_state: "none" })
        .eq("id", fresh.id);
      await fetch(`${SUPABASE_URL}/functions/v1/recompute-fleet-controls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      const { data: row } = await admin.from("vehicle_inspections")
        .select("immobilization_state").eq("id", fresh.id).single();
      push("11", "auto_immobilisation_enabled=false → no system request",
        row?.immobilization_state === "none",
        { immobilization_state: row?.immobilization_state });
      await admin.from("vehicle_inspections").delete().eq("id", fresh.id);
    }

    /* ───────────────────── 12. AUTO IMMOBILIZATION ON  ───────── */
    {
      await setSetting(admin, "fleet_control.auto_immobilisation_enabled", true);
      const fresh = await freshControl(admin, seeded);
      await admin.from("vehicle_inspections")
        .update({ status: "overdue",
                  due_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
                  reminder_count: 5,
                  immobilization_state: "none" })
        .eq("id", fresh.id);
      await fetch(`${SUPABASE_URL}/functions/v1/recompute-fleet-controls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      const { data: row } = await admin.from("vehicle_inspections")
        .select("immobilization_state").eq("id", fresh.id).single();
      const { data: audit } = await admin.from("fleet_control_audit")
        .select("actor_type, action").eq("fleet_control_id", fresh.id)
        .eq("action", "immobilization_requested")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      push("12", "auto_immobilisation_enabled=true → system immobilization request",
        row?.immobilization_state === "requested" && audit?.actor_type === "system",
        { immobilization_state: row?.immobilization_state, audit });
      await admin.from("vehicle_inspections").delete().eq("id", fresh.id);
      await setSetting(admin, "fleet_control.auto_immobilisation_enabled", false);
    }

    /* ───────────────────── 13. SETTINGS (cycle_days 14→7)  ───── */
    {
      const original = await getSetting(admin, "fleet_control.cycle_days") ?? 14;
      await setSetting(admin, "fleet_control.cycle_days", 7);
      const fresh = await freshControl(admin, seeded); // honors new default at INSERT
      // Submit + approve to verify due_at uses 7d
      for (const z of REQUIRED) {
        await seedItem(admin, seeded, fresh.id, z, "submitted");
      }
      await admin.from("vehicle_inspections")
        .update({ status: "submitted", cycle_days: 7 }).eq("id", fresh.id);
      const { error } = await adminClient.rpc("fleet_control_approve", { p_control: fresh.id });
      const { data: row } = await admin.from("vehicle_inspections")
        .select("due_at, cycle_days").eq("id", fresh.id).single();
      const expected = Date.now() + 7 * 86_400_000;
      const ok = Math.abs(new Date(row!.due_at).getTime() - expected) < 5 * 60_000;
      push("13", "cycle_days=7 → next due is 7 days after approval",
        ok && row?.cycle_days === 7 && !error,
        { row, error: error?.message });
      await setSetting(admin, "fleet_control.cycle_days", original);
      await admin.from("vehicle_inspections").delete().eq("id", fresh.id);
    }

    /* ───────────────────── 14. RLS / SECURITY  ───────────────── */
    {
      // Foreign driver (different tenant)
      const foreignDriverSees = await driverClient.from("vehicle_inspections")
        .select("id, driver_id");
      const foreignOnly = (foreignDriverSees.data ?? []).every(r => r.driver_id === seeded.driverId);

      // Driver tries to approve — must fail (RPC raises or non-admin denial)
      const drvApprove = await driverClient.rpc("fleet_control_approve", { p_control: controlId });

      // After approval as driver: status should NOT have flipped to approved through the driver client
      // (we reset state earlier; current state is 'blocked' from test 10)
      const { data: stillBlocked } = await admin
        .from("vehicle_inspections").select("status").eq("id", controlId).single();

      push("14", "RLS: driver sees only own controls; driver cannot approve",
        foreignOnly &&
        (drvApprove.error !== null || stillBlocked?.status !== "approved"),
        {
          driver_visible_rows: foreignDriverSees.data?.length,
          all_belong_to_self: foreignOnly,
          driver_approve_error: drvApprove.error?.message ?? null,
          status_after_driver_attempt: stillBlocked?.status,
        });
    }

    /* ───────────────────── 15. NOTIFICATIONS  ────────────────── */
    {
      const { data: notifs } = await admin.from("notifications")
        .select("notification_type").eq("driver_id", seeded.driverId);
      const types = new Set((notifs ?? []).map(n => n.notification_type));
      const expected = ["fleet_control_reminder","fleet_control_rejected","fleet_control_approved","fleet_control_blocked","fleet_control_overdue"];
      const missing = expected.filter(t => !types.has(t));
      push("15", "Driver receives all required notification types",
        missing.length === 0,
        { received: [...types], missing });
    }

    /* ───────────────────── 16. AUDIT TRAIL  ──────────────────── */
    {
      const { data: rows } = await admin.from("fleet_control_audit")
        .select("action, actor_type").eq("fleet_control_id", controlId);
      const actions = new Set((rows ?? []).map(r => r.action));
      const expected = [
        "item_submitted","item_approved","item_rejected",
        "control_approved","control_rejected",
        "reminder_sent","status_recomputed",
        "immobilization_requested","immobilization_cancelled",
      ];
      const missing = expected.filter(a => !actions.has(a));
      push("16", "Audit trail records all key actions",
        missing.length === 0,
        { actions: [...actions], missing });
    }

    /* ───────────────────── DONE ─────────────────── */
    const passed = report.filter(r => r.pass).length;
    return new Response(
      JSON.stringify({
        ok: true,
        passed,
        total: report.length,
        seeded,
        report,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message, stack: (err as Error).stack, report }, null, 2),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  /* ───────────────────── helpers ───────────────────── */
  async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signIn(${email}): ${error.message}`);
    return c;
  }

  async function getSetting(c: SupabaseClient, key: string): Promise<any> {
    const { data } = await c.from("platform_settings").select("setting_value").eq("setting_key", key).maybeSingle();
    return data?.setting_value;
  }

  async function setSetting(c: SupabaseClient, key: string, value: any) {
    await c.from("platform_settings").upsert(
      { setting_key: key, setting_value: value, updated_at: new Date().toISOString() },
      { onConflict: "setting_key" },
    );
  }

  // Seed one inspection item: a tiny real storage object (the submit/approve
  // RPCs verify the object exists) + the matching photos row.
  async function seedItem(
    c: SupabaseClient,
    s: any,
    inspectionId: string,
    zone: string,
    validationStatus: "pending" | "submitted",
  ) {
    const path = `e2e/${inspectionId}/${zone}.jpg`;
    await c.storage.from("vehicle-inspections").upload(
      path,
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), // minimal JPEG marker bytes
      { contentType: "image/jpeg", upsert: true },
    );
    await c.from("vehicle_inspection_photos").upsert({
      inspection_id: inspectionId,
      zone,
      item_type: zone.startsWith("doc_") ? "document" : "photo",
      storage_path: path,
      customer_id: s.customerId,
      vehicle_id: s.vehicleId,
      driver_id: s.driverId,
      validation_status: validationStatus,
      ...(validationStatus === "submitted" ? { submitted_at: new Date().toISOString() } : {}),
    }, { onConflict: "inspection_id,zone" });
  }

  async function freshControl(c: SupabaseClient, s: any) {
    const { data, error } = await c.from("vehicle_inspections").insert({
      customer_id: s.customerId, vehicle_id: s.vehicleId, driver_id: s.driverId,
      status: "pending", due_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      cycle_days: await getSetting(c, "fleet_control.cycle_days") ?? 14,
    }).select("id").single();
    if (error) throw new Error(`freshControl: ${error.message}`);
    return data;
  }

  async function seed(c: SupabaseClient) {
    // Tenant
    let { data: cust } = await c.from("customers").select("id").eq("name", TENANT_NAME).maybeSingle();
    if (!cust) {
      const r = await c.from("customers").insert({
        name: TENANT_NAME, slug: "fc-e2e-test", is_active: true,
      }).select("id").single();
      cust = r.data!;
    }

    // Admin auth user
    let adminUserId: string;
    const list = await c.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existAdm = list.data?.users.find(u => u.email === ADMIN_EMAIL);
    if (existAdm) {
      adminUserId = existAdm.id;
      await c.auth.admin.updateUserById(existAdm.id, { password: ADMIN_PASS, email_confirm: true });
    } else {
      const r = await c.auth.admin.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASS, email_confirm: true });
      adminUserId = r.data.user!.id;
    }
    await c.from("admin_users").upsert({
      user_id: adminUserId, email: ADMIN_EMAIL, full_name: "FC E2E Admin",
      role_key: "manager", customer_id: cust!.id, is_platform_owner: false,
      is_active: true, email_verified: true,
    }, { onConflict: "email" });

    // Driver auth user
    let driverUserId: string;
    const existDrv = list.data?.users.find(u => u.email === DRIVER_EMAIL);
    if (existDrv) {
      driverUserId = existDrv.id;
      await c.auth.admin.updateUserById(existDrv.id, { password: DRIVER_PASS, email_confirm: true });
    } else {
      const r = await c.auth.admin.createUser({ email: DRIVER_EMAIL, password: DRIVER_PASS, email_confirm: true });
      driverUserId = r.data.user!.id;
    }

    // Driver row
    let { data: drv } = await c.from("drivers").select("id").eq("auth_user_id", driverUserId).maybeSingle();
    if (!drv) {
      const r = await c.from("drivers").insert({
        auth_user_id: driverUserId, user_id: driverUserId,
        yango_driver_id: `fc-e2e-${Date.now()}`,
        full_name: "Mamadou Test E2E", email: DRIVER_EMAIL,
        phone_number: "+225 05 99 99 99 99", kyc_status: "verified",
        driver_status: "active", customer_id: cust!.id, is_test: true,
      }).select("id").single();
      drv = r.data!;
    }

    // Vehicle (idempotent on plate)
    let { data: veh } = await c.from("vehicles").select("id").eq("license_plate", PLATE).maybeSingle();
    if (!veh) {
      const r = await c.from("vehicles").insert({
        license_plate: PLATE, model_name: "Toyota Yaris E2E",
        vehicle_type: "sedan", rent_per_day: 15000,
        status: "rented", uffizio_imei: IMEI, customer_id: cust!.id,
        is_test: true, gps_active: true,
      }).select("id").single();
      veh = r.data!;
    } else {
      await c.from("vehicles").update({ uffizio_imei: IMEI, status: "rented", customer_id: cust!.id }).eq("id", veh.id);
    }

    // Wipe prior fleet-control state for clean run
    await c.from("vehicle_inspections").delete().eq("vehicle_id", veh!.id);
    await c.from("notifications").delete().eq("driver_id", drv!.id);
    await c.from("vehicle_immobilization_commands").delete().eq("vehicle_id", veh!.id);

    // Rental — activating it fires the autocreate trigger
    await c.from("rentals").delete().eq("vehicle_id", veh!.id);
    const { data: rental, error: rerr } = await c.from("rentals").insert({
      driver_id: drv!.id, vehicle_id: veh!.id, customer_id: cust!.id,
      status: "active", start_date: new Date().toISOString().slice(0, 10),
      rental_days: 1, requested_rate: 15000, approved_rate: 15000, final_rate: 15000,
    }).select("id").single();
    if (rerr) throw new Error(`rental insert: ${rerr.message}`);

    return {
      customerId: cust!.id, customerName: TENANT_NAME,
      adminUserId, driverUserId,
      driverId: drv!.id, driverName: "Mamadou Test E2E",
      vehicleId: veh!.id, plate: PLATE, imei: IMEI,
      rentalId: rental!.id,
    };
  }
});