import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { supabaseAdmin as supabase } from '@/integrations/supabase/clients';

export default function AdminForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Veuillez entrer votre adresse email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Veuillez entrer une adresse email valide');
      return;
    }

    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      });

      if (error) {
        toast.error(error.message);
        setIsLoading(false);
        return;
      }

      setEmailSent(true);
      toast.success('Email de réinitialisation envoyé!');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'envoi');
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
          <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-glow">
            <span className="text-2xl font-bold text-white">DF</span>
          </div>
          <h1 className="text-2xl font-bold text-white">DAM Flotte</h1>
          <p className="text-sm text-white/60 mt-1">Administration</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {emailSent ? 'Email envoyé!' : 'Mot de passe oublié'}
            </CardTitle>
            <CardDescription>
              {emailSent 
                ? 'Vérifiez votre boîte de réception' 
                : 'Entrez votre email pour réinitialiser votre mot de passe'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Nous avons envoyé un email à <strong>{email}</strong> avec un lien pour réinitialiser votre mot de passe.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Si vous ne voyez pas l'email, vérifiez votre dossier spam.
                  </p>
                </div>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setEmailSent(false);
                      setEmail('');
                    }}
                  >
                    Réessayer avec un autre email
                  </Button>
                  <Link to="/admin/login" className="block">
                    <Button variant="ghost" className="w-full gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Retour à la connexion
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse email</Label>
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

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Envoi...
                    </div>
                  ) : (
                    'Envoyer le lien de réinitialisation'
                  )}
                </Button>

                <Link to="/admin/login" className="block">
                  <Button variant="ghost" className="w-full gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Retour à la connexion
                  </Button>
                </Link>
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