/**
 * B30 — Driver route guard.
 * Redirects to /driver/login if no active session.
 * Also enforces driver_status: suspended/inactive accounts are signed out.
 */
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabaseDriver as supabase } from '@/integrations/supabase/clients';
import { LoadingState } from '@/components/LoadingState';
import { toast } from 'sonner';

type GuardStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'suspended' | 'inactive';

export function DriverRouteGuard() {
  const [status, setStatus] = useState<GuardStatus>('checking');
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const evaluate = async (session: { user: { id: string } } | null) => {
      if (!session) {
        if (!cancelled) setStatus('unauthenticated');
        return;
      }

      // Check the driver's status; suspended/inactive accounts must not access the app.
      // Match on either user_id or auth_user_id because managed driver accounts populate
      // both columns and we cannot assume which one was set first.
      const { data: driver } = await supabase
        .from('drivers')
        .select('driver_status')
        .or(`user_id.eq.${session.user.id},auth_user_id.eq.${session.user.id}`)
        .maybeSingle();

      if (cancelled) return;

      if (driver?.driver_status === 'suspended') {
        await supabase.auth.signOut();
        toast.error('Compte suspendu', {
          description: 'Votre compte a été suspendu. Contactez votre gestionnaire de flotte.',
        });
        setStatus('suspended');
        return;
      }
      if (driver?.driver_status === 'inactive') {
        await supabase.auth.signOut();
        toast.error('Compte inactif', {
          description: 'Votre compte est inactif. Contactez votre gestionnaire de flotte.',
        });
        setStatus('inactive');
        return;
      }

      setStatus('authenticated');
    };

    supabase.auth.getSession().then(({ data: { session } }) => evaluate(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      evaluate(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingState message="Vérification..." />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/driver/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/**
 * Redirect logged-in DRIVERS away from /driver/login.
 * If the active session belongs to an admin (no driver record),
 * sign out so the visitor can log in as a driver instead.
 */
export function DriverLoginRedirect({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isDriver, setIsDriver] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsDriver(false);
        setLoading(false);
        return;
      }

      // Check if the session user has a driver record
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (driver) {
        setIsDriver(true);
      } else {
        // Admin (or other) session — sign out so they can log in as driver
        await supabase.auth.signOut();
        setIsDriver(false);
      }
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

  if (isDriver) {
    return <Navigate to="/driver" replace />;
  }

  return <>{children}</>;
}
