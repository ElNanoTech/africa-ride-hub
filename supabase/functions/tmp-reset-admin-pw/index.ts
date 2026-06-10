import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const c = createClient(url, key);
  const { email, password } = await req.json();
  const { data: list } = await c.auth.admin.listUsers({ page: 1, perPage: 200 });
  const u = list.users.find(x => x.email === email);
  if (!u) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  const { error } = await c.auth.admin.updateUserById(u.id, { password, email_confirm: true });
  return new Response(JSON.stringify({ ok: !error, error: error?.message, id: u.id }), { headers: cors });
});
