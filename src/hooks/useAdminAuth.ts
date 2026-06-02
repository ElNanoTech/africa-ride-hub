import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Session } from '@supabase/supabase-js';
import { supabaseAdmin as supabase } from '@/integrations/supabase/clients';
import { toast } from 'sonner';
import { checkIsAdminWithRetry } from '@/lib/adminAuthCheck';
import { installFocusRefresh, verifySignOut } from '@/lib/adminSessionGuard';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role_key: string;
  // Keep roles array for backwards compatibility with components expecting array
  roles: string[];
}

export function useAdminAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  const fetchAdminProfile = useCallback(async (userId: string) => {
    try {
      // First check if user is an admin using the database function
      const adminCheck = await checkIsAdminWithRetry(userId);

      if (!adminCheck.ok) {
        console.warn('Transient error checking admin status:', adminCheck.error);
        return null;
      }

      if (!adminCheck.isAdmin) {
        setIsAdmin(false);
        return null;
      }

      setIsAdmin(true);

      // Fetch admin user details with role_key
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('id, email, full_name, is_active, role_key')
        .eq('user_id', userId)
        .single();

      if (adminError || !adminData) {
        console.error('Error fetching admin profile:', adminError);
        return null;
      }

      // Create admin profile with role_key as primary and roles array for compatibility
      const adminProfile: AdminUser = {
        id: adminData.id,
        email: adminData.email,
        full_name: adminData.full_name,
        is_active: adminData.is_active,
        role_key: adminData.role_key || 'manager',
        roles: [adminData.role_key || 'manager'] // Array for backwards compatibility
      };

      setAdminUser(adminProfile);
      return adminProfile;
    } catch (error) {
      console.error('Error in fetchAdminProfile:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          // Phantom SIGNED_OUT events fire during refresh-token rotation
          // races and brief offline windows. Confirm before clearing state.
          verifySignOut().then((reallyOut) => {
            if (!reallyOut) return;
            setSession(null);
            setUser(null);
            setAdminUser(null);
            setIsAdmin(false);
            setIsLoading(false);
          });
          return;
        }

        if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;

        setSession(session);
        setUser(session?.user ?? null);

        // Defer admin profile fetch with setTimeout
        if (session?.user) {
          setTimeout(() => {
            fetchAdminProfile(session.user.id);
          }, 0);
        } else {
          setAdminUser(null);
          setIsAdmin(false);
        }
        setIsLoading(false);
      }
    );

    // Keep the JWT fresh while admin tabs are idle in the background.
    const cleanupFocus = installFocusRefresh();

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchAdminProfile(session.user.id).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      cleanupFocus();
    };
  }, [fetchAdminProfile]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { error };
      }

      if (data.user) {
        const adminProfile = await fetchAdminProfile(data.user.id);
        
        if (!adminProfile) {
          // User is not an admin, sign them out
          await supabase.auth.signOut();
          return { error: { message: 'Accès refusé. Vous n\'êtes pas autorisé à accéder à l\'administration.' } };
        }

        // Update last login timestamp
        await supabase
          .from('admin_users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('user_id', data.user.id);
      }

      return { error: null };
    } catch (error: any) {
      return { error: { message: error.message || 'Erreur de connexion' } };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setAdminUser(null);
      setIsAdmin(false);
      navigate('/admin/login');
      toast.success('Déconnexion réussie');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Erreur lors de la déconnexion');
    }
  };

  const hasRole = (role: string) => {
    return adminUser?.role_key === role || false;
  };

  return {
    user,
    session,
    adminUser,
    isLoading,
    isAdmin,
    signIn,
    signOut,
    hasRole
  };
}

// Protected route wrapper hook
export function useRequireAdmin() {
  const { user, isLoading, isAdmin, adminUser } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate('/admin/login');
      } else if (!isAdmin) {
        toast.error('Accès refusé');
        navigate('/admin/login');
      }
    }
  }, [user, isLoading, isAdmin, navigate]);

  return { isLoading, isAdmin, adminUser, isAuthenticated: !!user && isAdmin };
}
