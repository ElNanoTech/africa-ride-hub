import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { supabaseAdmin as supabase } from '@/integrations/supabase/clients';

export default function AdminResetPassword() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check for valid session from email link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setHasSession(!!session);
      setIsChecking(false);
    };
    
    checkSession();

    // Listen for auth changes (when user clicks email link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setHasSession(true);
        setIsChecking(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 6) {
      return 'Le mot de passe doit contenir au moins 6 caractères';
    }
    return null;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const passwordError = validatePassword(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        toast.error(error.message);
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      toast.success('Mot de passe réinitialisé avec succès!');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/admin/login');
      }, 3000);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la réinitialisation');
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center p-6">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
          <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-glow">
            <span className="text-2xl font-bold text-white">DF</span>
          </div>
          <h1 className="text-2xl font-bold text-white">DAM Flotte</h1>
          <p className="text-sm text-white/60 mt-1">Administration</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {isSuccess ? 'Mot de passe réinitialisé!' : 'Nouveau mot de passe'}
            </CardTitle>
            <CardDescription>
              {isSuccess 
                ? 'Vous allez être redirigé vers la page de connexion' 
                : hasSession 
                  ? 'Entrez votre nouveau mot de passe'
                  : 'Lien de réinitialisation invalide ou expiré'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSuccess ? (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Votre mot de passe a été réinitialisé avec succès. Redirection en cours...
                </p>
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : !hasSession ? (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Ce lien de réinitialisation est invalide ou a expiré.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Veuillez demander un nouveau lien de réinitialisation.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => navigate('/admin/forgot-password')}
                >
                  Demander un nouveau lien
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum 6 caractères
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
                      Réinitialisation...
                    </div>
                  ) : (
                    'Réinitialiser le mot de passe'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-white/40 mt-8 text-center">
          © 2026 DAM Flotte. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}