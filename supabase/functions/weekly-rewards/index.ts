import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get top 3 drivers from latest week
    const { data: topDrivers, error: topErr } = await supabase.rpc(
      "get_driver_leaderboard",
      { p_limit: 3 }
    );

    if (topErr) {
      console.error("Leaderboard error:", topErr);
      return new Response(
        JSON.stringify({ error: topErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!topDrivers || topDrivers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No drivers to reward" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const medals = ["🥇", "🥈", "🥉"];
    const positions = ["1er", "2ème", "3ème"];
    const perks = [
      "Vous bénéficiez d'une priorité pour les nouveaux véhicules!",
      "Continuez comme ça pour décrocher la première place!",
      "Vous êtes sur le podium, bravo!",
    ];

    const notifications = topDrivers.map((driver: any, index: number) => ({
      driver_id: driver.driver_id,
      title: `${medals[index]} Classement hebdomadaire — ${positions[index]} place!`,
      message: `Félicitations ${driver.driver_name}! Vous êtes ${positions[index]} cette semaine avec ${driver.score} points (Niveau ${driver.tier}). ${perks[index]}`,
      notification_type: "announcement",
    }));

    const { error: insertErr } = await supabase
      .from("notifications")
      .insert(notifications);

    if (insertErr) {
      console.error("Insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        notified: topDrivers.length,
        drivers: topDrivers.map((d: any) => d.driver_name),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
