import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, Lock, Eye, EyeOff, User } from 'lucide-react';


export default function AdminSetup() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('admin@damafrica.ci');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('Admin Test');

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password || !fullName) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    if (password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setIsLoading(true);
    
    try {
      // Use the setup-admin edge function which bypasses RLS
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/setup-admin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email, password, full_name: fullName }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Erreur lors de la création');
        setIsLoading(false);
        return;
      }

      toast.success('Compte administrateur créé avec succès!');
      navigate('/admin/login');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la création');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-glow">
            <span className="text-2xl font-bold text-white">DA</span>
          </div>
          <h1 className="text-2xl font-bold text-white">DAM Africa</h1>
          <p className="text-sm text-white/60 mt-1">Configuration Admin</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Créer un compte Admin</CardTitle>
            <CardDescription>
              Configuration initiale du compte administrateur
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nom complet</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Admin Test"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@damafrica.ci"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
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

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Création...
                  </div>
                ) : (
                  'Créer le compte'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-white/40 mt-8 text-center">
          Cette page est uniquement pour la configuration initiale.
        </p>
      </div>
    </div>
  );
}
