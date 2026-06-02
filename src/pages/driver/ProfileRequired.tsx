import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, RefreshCw, LogOut, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabaseDriver as supabase } from '@/integrations/supabase/clients';
import { toast } from 'sonner';
import damFlotteLogo from '@/assets/dam-flotte-logo.png';

export default function ProfileRequired() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProfile = async () => {
    setIsCreating(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userRes.user) {
        toast.error('Session expirée', { description: 'Veuillez vous reconnecter.' });
        navigate('/driver/login');
        return;
      }

      // Check if profile already exists
      const { data: existingDriver } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userRes.user.id)
        .maybeSingle();

      if (existingDriver?.id) {
        toast.success('Profil trouvé!');
        localStorage.setItem('onboarding-completed', 'true');
        navigate('/driver/kyc');
        return;
      }

      // Get metadata from signup
      const meta = (userRes.user.user_metadata || {}) as Record<string, any>;
      const phoneNumber = (meta.phone_number as string | undefined) || '';
      const fullName = (meta.full_name as string | undefined) || 'Conducteur';
      const normalizedPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

      const { error: insertErr } = await supabase.from('drivers').insert({
        user_id: userRes.user.id,
        auth_user_id: userRes.user.id,
        full_name: fullName,
        phone_number: phoneNumber || '+225',
        yango_driver_id: normalizedPhone
          ? `NATIVE_${normalizedPhone}`
          : `NATIVE_${userRes.user.id.slice(0, 8)}`,
        kyc_status: 'not_submitted',
        driver_status: 'active',
      });

      if (insertErr) {
        console.error('Profile creation error:', insertErr);
        throw insertErr;
      }

      toast.success('Profil créé avec succès!');
      localStorage.setItem('onboarding-completed', 'true');
      navigate('/driver/kyc');
    } catch (e: any) {
      console.error(e);
      toast.error('Impossible de créer le profil', {
        description: e?.message || 'Veuillez réessayer ou contacter le support.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/driver/login');
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
        </div>

        <Card className="border-warning/30 bg-card">
          <CardContent className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-warning/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-warning" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Profil conducteur requis</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Votre compte a été créé, mais le profil conducteur n'a pas été initialisé correctement.
                </p>
              </div>
            </div>

            {/* Info box */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary" />
                <span>Ce processus est sécurisé</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Cliquez sur le bouton ci-dessous pour finaliser votre inscription et accéder à la vérification KYC.
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={handleCreateProfile}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Finaliser mon profil
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleLogout}
                disabled={isCreating}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Retour à la connexion
              </Button>
            </div>

            {/* Help text */}
            <p className="text-xs text-center text-muted-foreground">
              Si le problème persiste, contactez le support via WhatsApp.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
