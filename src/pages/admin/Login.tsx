import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AUTH, UI } from '@/lib/i18n';
import { toast } from 'sonner';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabaseAdmin as supabase } from '@/integrations/supabase/clients';
import damFlotteLogo from '@/assets/dam-flotte-logo.png';
import { checkIsAdminWithRetry } from '@/lib/adminAuthCheck';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Check if already logged in as admin
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Check if user is admin
        const adminCheck = await checkIsAdminWithRetry(session.user.id);
        
        if (adminCheck.ok && adminCheck.isAdmin) {
          navigate('/admin');
        }
      }
    };
    checkSession();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        const msg = error.message?.toLowerCase() || '';
        const isCredError = msg.includes('invalid') || msg.includes('credentials') || msg.includes('password');
        toast.error(isCredError ? 'Email ou mot de passe incorrect' : (error.message || 'Erreur de connexion'));
        setIsLoading(false);
        return;
      }

      if (data.user) {
        // Check if user is an admin
        const adminCheck = await checkIsAdminWithRetry(data.user.id);

        if (!adminCheck.ok) {
          console.warn('Admin check transient error:', adminCheck.error);
          toast.error('Erreur lors de la vérification des droits');
          setIsLoading(false);
          return;
        }

        if (!adminCheck.isAdmin) {
          await supabase.auth.signOut();
          toast.error('Accès refusé. Vous n\'êtes pas autorisé à accéder à l\'administration.');
          setIsLoading(false);
          return;
        }

        // Update last login timestamp
        await supabase
          .from('admin_users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('user_id', data.user.id);

        toast.success('Connexion réussie!');
        navigate('/admin');
      }
    } catch (error: any) {
      console.error('[AdminLogin] login error:', error);
      toast.error('Email ou mot de passe incorrect.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center p-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <img 
            src={damFlotteLogo} 
            alt="DAM Flotte" 
            className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-glow object-contain"
          />
          <h1 className="text-2xl font-bold text-white">DAM Flotte</h1>
          <p className="text-sm text-white/60 mt-1">Administration</p>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{AUTH.ADMIN_LOGIN}</CardTitle>
            <CardDescription>
              Connectez-vous à votre compte administrateur
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{AUTH.EMAIL}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@damafrica.ci"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{AUTH.PASSWORD}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <a href="/admin/forgot-password" className="text-sm text-primary hover:underline">
                  {AUTH.FORGOT_PASSWORD}
                </a>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    {UI.LOADING}
                  </div>
                ) : (
                  AUTH.LOGIN
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 text-center space-y-3">
          <a 
            href="/login" 
            className="text-xs text-white/60 hover:text-white/80 hover:underline"
          >
            Retour à l'accueil
          </a>
          <p className="text-xs text-white/40">
            © 2026 DAM Flotte. Tous droits réservés.
          </p>
        </div>
      </div>
    </div>
  );
}
