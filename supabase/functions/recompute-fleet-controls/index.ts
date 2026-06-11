import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Fleet Control — daily recompute job.
 *
 * Per the SPEC §13 / §12:
 *   1. Pending/submitted controls past their due date become "overdue".
 *   2. Controls attached to a returned/cancelled rental become "cancelled".
 *   3. If fleet_control.auto_immobilisation_enabled is true AND a control
 *      has crossed the late_threshold_days OR relance_threshold, transition
 *      its immobilization_state to "requested" so the parking-check job can
 *      pick it up and dispatch the (honest) cut command.
 *
 * This function never claims an engine was actually cut.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Settings
    const { data: rawSettings } = await supabase.rpc("fleet_control_settings");
    const s = rawSettings ?? {};
    const lateThresholdDays = Number(s.late_threshold_days ?? 3);
    const relanceThreshold  = Number(s.relance_threshold ?? 2);
    const autoEnabled       = Boolean(s.auto_immobilisation_enabled ?? false);

    // 1) Mark pending/submitted as overdue when past due.
    const { data: overdueRows } = await supabase
      .from("vehicle_inspections")
      .update({ status: "overdue" })
      .lt("due_at", new Date().toISOString())
      .in("status", ["pending", "submitted"])
      .select("id, driver_id, customer_id, vehicles:vehicles ( license_plate )");

    // Notify drivers about newly overdue controls
    for (const r of overdueRows ?? []) {
      if (!r.driver_id) continue;
      const plate = (r as any).vehicles?.license_plate ?? "votre véhicule";
      await supabase.from("notifications").insert({
        driver_id: r.driver_id,
        customer_id: r.customer_id,
        notification_type: "fleet_control_overdue",
        title: "Contrôle en retard",
        message: `Soumettez vos photos pour ${plate} dès que possible.`,
        priority: "high",
      });
      await supabase.rpc("fleet_control_log", {
        p_control: r.id,
        p_action: "status_recomputed",
        p_metadata: { to: "overdue" },
        p_actor_type: "system",
      });
    }

    // 2) Cancel controls for returned/cancelled rentals
    const { data: cancelRows } = await supabase
      .from("vehicle_inspections")
      .select("id, rental_id")
      .not("rental_id", "is", null)
      .in("status", ["pending", "overdue", "submitted", "rejected"]);

    let cancelled = 0;
    for (const c of cancelRows ?? []) {
      const { data: rental } = await supabase
        .from("rentals")
        .select("status")
        .eq("id", c.rental_id)
        .maybeSingle();
      if (rental && ["returned", "completed", "cancelled"].includes(rental.status)) {
        await supabase
          .from("vehicle_inspections")
          .update({ status: "cancelled" })
          .eq("id", c.id);
        await supabase.rpc("fleet_control_log", {
          p_control: c.id,
          p_action: "status_recomputed",
          p_metadata: { to: "cancelled", reason: "rental_closed" },
          p_actor_type: "system",
        });
        cancelled++;
      }
    }

    // 3) Auto-immobilization escalation
    let autoQueued = 0;
    if (autoEnabled) {
      const cutoff = new Date(Date.now() - lateThresholdDays * 86400000).toISOString();
      const { data: candidates } = await supabase
        .from("vehicle_inspections")
        .select("id, due_at, reminder_count, immobilization_state")
        .eq("status", "overdue")
        .in("immobilization_state", ["none", "cancelled", "unblocked"])
        .or(`due_at.lt.${cutoff},reminder_count.gte.${relanceThreshold}`);

      for (const c of candidates ?? []) {
        const { error } = await supabase.rpc("fleet_control_immobilize_request", {
          p_control: c.id,
          p_reason: `Auto: seuil dépassé (${c.reminder_count} relances, retard ≥ ${lateThresholdDays} j)`,
        });
        if (!error) autoQueued++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        overdue_marked: overdueRows?.length ?? 0,
        cancelled,
        auto_immobilization_queued: autoQueued,
        auto_enabled: autoEnabled,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("recompute-fleet-controls error", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});