import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabaseAdmin as supabase } from "@/integrations/supabase/clients";
import { logDiagnostic } from "@/lib/diagnostics";

const STORAGE_KEY = "admin.activeCustomerId";

export interface AdminCustomerOption {
  id: string;
  name: string;
  slug: string;
}

/**
 * Returns the current admin user + an "active customer scope".
 *
 * - Restricted admins (with their own customer_id) → scope is locked to that.
 * - Platform Owners (customer_id = NULL) → can pick any tenant; selection is
 *   persisted in localStorage. Defaults to the first available customer so
 *   tenant-scoped pages (Billing, etc.) always have a working `customer_id`.
 */
export function useAdminUser() {
  const userQuery = useQuery({
    queryKey: ["current-admin-user"],
    queryFn: async () => {
      // Prefer getSession() which restores from storage synchronously,
      // avoiding the race where getUser() returns null right after page load.
      const { data: sessionData } = await supabase.auth.getSession();
      let userId = sessionData?.session?.user?.id ?? null;
      if (!userId) {
        // Fallback: explicitly fetch user (network call).
        const { data: auth } = await supabase.auth.getUser();
        userId = auth?.user?.id ?? null;
      }
      if (!userId) {
        // Signal "not ready yet" so React Query retries instead of caching null
        // (which previously showed the "no customer" warning until re-login).
        logDiagnostic("admin_user_auth_not_ready", {}, "warn");
        throw new Error("AUTH_NOT_READY");
      }
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, email, full_name, role_key, customer_id, is_platform_owner, is_active")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        logDiagnostic("admin_user_query_error", {
          userId,
          errorMessage: error.message,
          errorName: error.name,
        });
        throw error;
      }
      return data;
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, err) => {
      // Retry the auth race a few times with backoff; surface other errors.
      if (err instanceof Error && err.message === "AUTH_NOT_READY") return failureCount < 5;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  const adminUser = userQuery.data ?? null;
  const isPlatformOwner = !!adminUser?.is_platform_owner;

  // Refetch admin user whenever the auth session changes (sign-in, token refresh).
  // Prevents the "no customer" warning from sticking when the initial session
  // hadn't restored from storage on first render.
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        queryClient.invalidateQueries({ queryKey: ["current-admin-user"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  // Customer list — only fetched for platform owners
  const customersQuery = useQuery({
    queryKey: ["admin-customer-options"],
    enabled: isPlatformOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, slug")
        .order("name");
      if (error) throw error;
      return (data ?? []) as AdminCustomerOption[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Active customer selection (platform owners only)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  // Auto-pick the first customer when platform owner has none selected
  useEffect(() => {
    if (!isPlatformOwner) return;
    if (selectedCustomerId) return;
    const first = customersQuery.data?.[0]?.id;
    if (first) {
      setSelectedCustomerId(first);
      window.localStorage.setItem(STORAGE_KEY, first);
    }
  }, [isPlatformOwner, selectedCustomerId, customersQuery.data]);

  const setActiveCustomerId = useCallback((id: string | null) => {
    setSelectedCustomerId(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Effective customer_id used by tenant-scoped queries
  const customerId: string | null = isPlatformOwner
    ? selectedCustomerId
    : adminUser?.customer_id ?? null;

  // Surface a unified "still resolving" flag so consuming pages never show
  // a false "no customer" error during auth hydration, retries, or while the
  // customers list is loading for platform owners.
  const isResolving =
    userQuery.isLoading ||
    userQuery.isFetching ||
    userQuery.isError ||
    (isPlatformOwner && customersQuery.isLoading);

  // Diagnostic: log when a fully-resolved admin profile has no usable
  // customer_id. This is the exact symptom of the old race-condition bug, so
  // any future regression (or a brand-new role/group missing customer_id)
  // shows up immediately in Sentry / log drains. Logged once per session per
  // admin to avoid noise.
  const loggedNullCustomerRef = useRef<string | null>(null);
  useEffect(() => {
    if (isResolving) return;
    if (!adminUser) return;
    if (customerId) return;
    if (isPlatformOwner) return; // platform owners legitimately may have no scope picked yet
    const key = adminUser.id;
    if (loggedNullCustomerRef.current === key) return;
    loggedNullCustomerRef.current = key;
    logDiagnostic("admin_user_null_customer", {
      adminUserId: adminUser.id,
      isPlatformOwner: !!adminUser.is_platform_owner,
      roleKey: (adminUser as { role_key?: string }).role_key ?? null,
    });
  }, [isResolving, adminUser, customerId, isPlatformOwner]);

  // Diagnostic: log query errors (network, RLS, etc.) so we know if the
  // billing recovery screen is being shown to real users.
  useEffect(() => {
    if (!userQuery.isError) return;
    const err = userQuery.error as Error | undefined;
    logDiagnostic("admin_user_query_error", {
      errorMessage: err?.message,
      errorName: err?.name,
    });
  }, [userQuery.isError, userQuery.error]);


  return {
    adminUser,
    isLoading: userQuery.isLoading,
    isResolving,
    isError: userQuery.isError,
    refetch: userQuery.refetch,
    isPlatformOwner,
    customerId,
    customers: customersQuery.data ?? [],
    activeCustomerId: selectedCustomerId,
    setActiveCustomerId,
  };
}
