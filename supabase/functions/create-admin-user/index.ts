import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AppRole = 'super_admin' | 'manager' | 'loan_officer' | 'support_agent';

interface CreateAdminUserBody {
  email: string;
  password?: string;
  full_name: string;
  roles: AppRole[];
  customer_id?: string | null; // Only honored for platform owners
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Permission: super_admin OR platform_owner can create admin users
    const { data: isSuperAdmin } = await userClient.rpc('has_admin_role', {
      _user_id: user.id,
      _role: 'super_admin',
    });

    // Resolve caller's tenant + platform-owner status (service role bypass for read).
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: callerAdmin, error: callerErr } = await adminClient
      .from('admin_users')
      .select('id, customer_id, is_platform_owner, is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (callerErr || !callerAdmin || !callerAdmin.is_active) {
      return new Response(JSON.stringify({ error: 'Admin account not found or inactive' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isSuperAdmin && !callerAdmin.is_platform_owner) {
      return new Response(JSON.stringify({ error: 'Only super admins can create admin users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Partial<CreateAdminUserBody>;
    const email = body.email?.trim()?.toLowerCase();
    const full_name = body.full_name?.trim();
    const password = body.password;
    const roles = Array.isArray(body.roles) ? (body.roles as AppRole[]) : [];

    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: 'email and full_name are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (password && password.length < 6) {
      return new Response(JSON.stringify({ error: 'password must be at least 6 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- Tenant resolution ----
    // Platform owners may pass an explicit `customer_id` (or null for unassigned).
    // Restricted admins (super_admin scoped to a tenant) are forced to their own customer_id;
    // any client-supplied customer_id is ignored.
    const requestedCustomerId = body.customer_id ?? null;
    const targetCustomerId: string | null = callerAdmin.is_platform_owner
      ? requestedCustomerId
      : (callerAdmin.customer_id ?? null);

    if (!callerAdmin.is_platform_owner && requestedCustomerId && requestedCustomerId !== callerAdmin.customer_id) {
      return new Response(JSON.stringify({
        error: 'Vous ne pouvez créer des utilisateurs que pour votre propre organisation.',
        code: 'tenant_violation',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!callerAdmin.is_platform_owner && !callerAdmin.customer_id) {
      return new Response(JSON.stringify({
        error: "Votre compte n'est rattaché à aucun client — contactez le support.",
        code: 'caller_missing_tenant',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Ensure no duplicate admin user row
    const { data: existingAdmin } = await adminClient
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingAdmin) {
      return new Response(JSON.stringify({ error: 'Un administrateur avec cet email existe déjà' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create auth user (does NOT affect current session because we use service role)
    let authUserId: string | null = null;

    if (password) {
      const { data: created, error: createAuthError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createAuthError) {
        // If already exists, proceed without linking; user can be linked later
        const msg = createAuthError.message || '';
        const alreadyExists = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists');
        if (!alreadyExists) {
          return new Response(JSON.stringify({ error: createAuthError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        authUserId = created.user?.id ?? null;
      }
    }

    const { data: adminUser, error: adminError } = await adminClient
      .from('admin_users')
      .insert({
        user_id: authUserId,
        email,
        full_name,
        is_active: true,
        customer_id: targetCustomerId,
      })
      .select()
      .single();

    if (adminError) {
      return new Response(JSON.stringify({ error: adminError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (roles.length > 0) {
      const roleInserts = roles.map((role) => ({
        admin_user_id: adminUser.id,
        role,
      }));

      const { error: rolesError } = await adminClient.from('admin_roles').insert(roleInserts);
      if (rolesError) {
        return new Response(JSON.stringify({ error: rolesError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Audit trail (best-effort; never blocks the response)
    await adminClient.from('admin_audit_logs').insert({
      admin_user_id: callerAdmin.id,
      action: 'admin_user_created',
      entity_type: 'admin_user',
      entity_id: adminUser.id,
      details: {
        email,
        full_name,
        roles,
        target_customer_id: targetCustomerId,
        caller_is_platform_owner: callerAdmin.is_platform_owner,
      },
    }).then(() => {}, (e) => console.warn('[create-admin-user] audit log failed:', e?.message));

    return new Response(JSON.stringify({ adminUser }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
