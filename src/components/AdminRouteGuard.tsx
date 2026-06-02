/**
 * B2 — Admin route guard.
 * Redirects to /admin/login if no active session.
 */
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabaseAdmin as supabase } from '@/integrations/supabase/clients';
import { LoadingState } from '@/components/LoadingState';
import { installFocusRefresh, verifySignOut } from '@/lib/adminSessionGuard';

export function AdminRouteGuard() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAuthenticated(!!session);
      setLoading(false);
    };

    // Listen for definitive auth changes. Ignore transient refresh churn with
    // a null session unless the auth system explicitly emits SIGNED_OUT —
    // and even then, double-check via getSession() because Supabase is known
    // to fire phantom SIGNED_OUT events during refresh-token rotation races
    // and brief offline windows. See src/lib/adminSessionGuard.ts.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        verifySignOut().then((reallyOut) => {
          if (reallyOut) {
            setAuthenticated(false);
          }
          setLoading(false);
        });
        return;
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || session) {
        setAuthenticated(!!session);
      }
      setLoading(false);
    });

    const cleanupFocus = installFocusRefresh();

    checkSession();
    return () => {
      subscription.unsubscribe();
      cleanupFocus();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingState message="Vérification..." />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/**
 * Redirect logged-in users away from /admin/login to /admin
 */
export function AdminLoginRedirect({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAuthenticated(!!session);
      setLoading(false);
    };
    checkSession();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingState message="Chargement..." />
      </div>
    );
  }

  if (authenticated) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
