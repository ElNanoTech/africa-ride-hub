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
 *     'blocked'. The actual engine-cut command remains PENDING_INTEGRATION
 *     because Uffizio SET_OUT is not wired yet — we are upfront about this.
 */
const PARKED_MAX_SPEED_KMH = 1; // tolerance for GPS jitter

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: rows } = await supabase
      .from("vehicle_inspections")
      .select("id, vehicle_id, driver_id, customer_id, immobilization_state")
      .in("immobilization_state", ["requested", "pending_stop"]);

    let advanced = 0;
    let cutSent = 0;

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

      // pending_stop → cut_sent (honest — command not actually delivered yet)
      await supabase
        .from("vehicle_inspections")
        .update({
          immobilization_state: "cut_sent",
          immobilization_command_ref: "PENDING_INTEGRATION",
          status: "blocked",
        })
        .eq("id", row.id);

      await supabase
        .from("vehicle_immobilization_commands")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: "PENDING_INTEGRATION" })
        .eq("inspection_id", row.id)
        .in("status", ["pending"]);

      if (row.driver_id) {
        await supabase.from("notifications").insert({
          driver_id: row.driver_id,
          customer_id: row.customer_id,
          notification_type: "fleet_control_blocked",
          title: "Véhicule bloqué",
          message: "Soumettez votre contrôle pour débloquer le véhicule.",
          priority: "high",
        });
      }

      await supabase.rpc("fleet_control_log", {
        p_control: row.id,
        p_action: "status_recomputed",
        p_metadata: { immobilization: "cut_sent", command_ref: "PENDING_INTEGRATION" },
        p_actor_type: "system",
      });
      cutSent++;
    }

    return new Response(
      JSON.stringify({ ok: true, advanced, cut_sent: cutSent, checked: rows?.length ?? 0 }),
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