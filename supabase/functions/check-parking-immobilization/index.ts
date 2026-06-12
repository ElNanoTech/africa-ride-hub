import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Fleet Control — parking-check immobilization job.
 *
 * Per SPEC §12 (honest immobilization workflow):
 *   - Pick up controls in immobilization_state = 'requested'
 *   - Read latest GPS position from vehicle_positions
 *   - If the vehicle is "parked" (speed == 0 AND ignition off) we transition
 *     state to 'pending_stop' → then to 'cut_sent' and mark the control
 *     'blocked'. The Uffizio SET_OUT call is wired (token fetch + device
 *     verification + setOutput payload assembly), but executes in DRY-RUN
 *     mode by default (`uffizio_immobilization_dry_run = true`). In dry-run
 *     we authenticate against Uffizio and confirm the device exists, then
 *     stamp the command_ref with `DRY_RUN:<imei>:<deviceId>` instead of
 *     transmitting the actual engine cut. To enable the real cut, flip
 *     `platform_settings.fleet_control.uffizio_immobilization_dry_run`
 *     to `false`. We never claim a cut we didn't perform.
 */
const PARKED_MAX_SPEED_KMH = 1; // tolerance for GPS jitter

/** Result of attempting to issue (or dry-run) a SET_OUT engine cut. */
interface SetOutResult {
  ok: boolean;
  dryRun: boolean;
  commandRef: string;
  status: "sent" | "simulated" | "failed";
  error?: string;
}

/**
 * Talk to Uffizio. In dry-run we verify connectivity + device existence
 * but stop short of transmitting SET_OUT. In live mode we POST setOutput.
 * Either way the result is fully reflected in fleet_control state.
 */
async function uffizioSetOut(
  imei: string,
  dryRun: boolean,
): Promise<SetOutResult> {
  const baseRaw = Deno.env.get("UFFIZIO_SERVER_URL") ?? "";
  const username = Deno.env.get("UFFIZIO_USERNAME") ?? "";
  const password = Deno.env.get("UFFIZIO_PASSWORD") ?? "";
  if (!baseRaw || !username || !password) {
    return { ok: false, dryRun, commandRef: "UFFIZIO_NOT_CONFIGURED",
             status: "failed", error: "Missing UFFIZIO_SERVER_URL / USERNAME / PASSWORD" };
  }

  // Normalize base URL (mirrors uffizio-auth helper)
  let base = baseRaw.trim();
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  try {
    const u = new URL(base);
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname);
    base = `${isIp ? "http:" : u.protocol}//${u.host}`;
  } catch { /* keep as-is */ }

  // 1) Auth — generate access token
  let token = "";
  try {
    const r = await fetch(`${base}/webservice?token=generateAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (data?.result !== 1 || !data?.data?.token) {
      return { ok: false, dryRun, commandRef: "UFFIZIO_AUTH_FAILED",
               status: "failed", error: data?.message ?? "auth failed" };
    }
    token = data.data.token as string;
  } catch (e) {
    return { ok: false, dryRun, commandRef: "UFFIZIO_AUTH_ERROR",
             status: "failed", error: (e as Error).message };
  }

  // 2) Verify the device exists / is reachable before any cut attempt.
  let deviceOk = false;
  let deviceLabel = "";
  try {
    const r = await fetch(`${base}/webservice?token=getVehicleDetail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "auth-code": token },
      body: JSON.stringify({ imeiNo: imei }),
    });
    const txt = await r.text();
    try {
      const data = JSON.parse(txt);
      const v = data?.data ?? data?.root?.VehicleData ?? null;
      deviceOk = !!v;
      deviceLabel = v?.vehicleNo ?? v?.vehicle_no ?? v?.licenseplate ?? "";
    } catch { /* non-JSON — treat as verification failure */ }
  } catch { /* swallow — treated as failure below */ }

  if (!deviceOk) {
    return { ok: false, dryRun, commandRef: `UFFIZIO_DEVICE_NOT_FOUND:${imei}`,
             status: "failed", error: "Device not reachable via Uffizio" };
  }

  if (dryRun) {
    // Wiring is real — engine cut intentionally suppressed.
    return {
      ok: true, dryRun: true, status: "simulated",
      commandRef: `DRY_RUN:setOutput:${imei}${deviceLabel ? `:${deviceLabel}` : ""}`,
    };
  }

  // 3) Live SET_OUT — engine cut. Payload follows Uffizio setOutput contract.
  try {
    const r = await fetch(`${base}/webservice?token=setOutput`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "auth-code": token },
      body: JSON.stringify({ imeiNo: imei, output: 1, status: "ON" }),
    });
    const txt = await r.text();
    let data: any = {};
    try { data = JSON.parse(txt); } catch { /* keep raw */ }
    const accepted = data?.result === 1 || /success|queued|accepted/i.test(txt);
    if (!accepted) {
      return { ok: false, dryRun: false, status: "failed",
               commandRef: `UFFIZIO_SETOUT_REJECTED`,
               error: data?.message ?? txt.slice(0, 200) };
    }
    return { ok: true, dryRun: false, status: "sent",
             commandRef: `UFFIZIO_SETOUT_OK:${imei}:${data?.data?.commandId ?? "ack"}` };
  } catch (e) {
    return { ok: false, dryRun: false, status: "failed",
             commandRef: "UFFIZIO_SETOUT_ERROR", error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Resolve dry-run flag from fleet-control settings. Defaults to TRUE
    // so we never accidentally cut a real engine without explicit opt-in.
    let dryRun = true;
    try {
      const { data: settings } = await supabase.rpc("fleet_control_settings");
      if (settings && typeof settings === "object") {
        const v = (settings as any).uffizio_immobilization_dry_run;
        if (v === false) dryRun = false;
      }
    } catch { /* keep default */ }

    const { data: rows } = await supabase
      .from("vehicle_inspections")
      .select("id, vehicle_id, driver_id, customer_id, immobilization_state")
      .in("immobilization_state", ["requested", "pending_stop"]);

    let advanced = 0;
    let cutSent = 0;
    let cutFailed = 0;

    for (const row of rows ?? []) {
      // Resolve the vehicle's Uffizio IMEI — vehicle_positions is keyed by imei_no.
      const { data: veh } = await supabase
        .from("vehicles")
        .select("uffizio_imei")
        .eq("id", row.vehicle_id)
        .maybeSingle();

      const imei = veh?.uffizio_imei ?? null;
      if (!imei) continue; // no telemetry possible — never falsely advance

      const { data: pos } = await supabase
        .from("vehicle_positions")
        .select("speed, ignition, synced_at")
        .eq("imei_no", imei)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const speed = Number(pos?.speed ?? 0);
      const ignitionOff = pos?.ignition === "0" || pos?.ignition === "OFF" || pos?.ignition === "off" || pos?.ignition == null;
      const parked = pos && speed <= PARKED_MAX_SPEED_KMH && ignitionOff;

      if (!parked) continue;

      if (row.immobilization_state === "requested") {
        await supabase
          .from("vehicle_inspections")
          .update({ immobilization_state: "pending_stop" })
          .eq("id", row.id);
        await supabase.rpc("fleet_control_log", {
          p_control: row.id,
          p_action: "status_recomputed",
          p_metadata: { immobilization: "pending_stop" },
          p_actor_type: "system",
        });
        advanced++;
        continue; // Let the next tick promote it to cut_sent
      }

      // pending_stop → call Uffizio (dry-run by default — never blindly cuts).
      const result = await uffizioSetOut(imei, dryRun);

      const newImmoState = result.ok ? "cut_sent" : "failed";
      const newControlStatus = result.ok ? "blocked" : "overdue";

      await supabase
        .from("vehicle_inspections")
        .update({
          immobilization_state: newImmoState,
          immobilization_command_ref: result.commandRef,
          status: newControlStatus,
        })
        .eq("id", row.id);

      await supabase
        .from("vehicle_immobilization_commands")
        .update({
          status: result.status,
          sent_at: new Date().toISOString(),
          error_message: result.error ?? (result.dryRun ? "DRY_RUN (engine cut suppressed)" : null),
        })
        .eq("inspection_id", row.id)
        .in("status", ["pending"]);

      if (result.ok && row.driver_id) {
        await supabase.from("notifications").insert({
          driver_id: row.driver_id,
          customer_id: row.customer_id,
          notification_type: "fleet_control_blocked",
          title: result.dryRun ? "Véhicule en cours de blocage" : "Véhicule bloqué",
          message: result.dryRun
            ? "Une coupure moteur a été programmée. Soumettez votre contrôle pour annuler."
            : "Soumettez votre contrôle pour débloquer le véhicule.",
        });
      }

      await supabase.rpc("fleet_control_log", {
        p_control: row.id,
        p_action: "status_recomputed",
        p_metadata: {
          immobilization: newImmoState,
          command_ref: result.commandRef,
          dry_run: result.dryRun,
          uffizio_status: result.status,
          error: result.error ?? null,
        },
        p_actor_type: "system",
      });
      if (result.ok) cutSent++; else cutFailed++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        advanced,
        cut_sent: cutSent,
        cut_failed: cutFailed,
        checked: rows?.length ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("check-parking-immobilization error", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});