import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useTheme } from 'next-themes';
import { Settings as SettingsIcon, Bell, Shield, Database, Loader2, KeyRound, Smartphone, MessageCircle, Building2, CheckCircle2 } from 'lucide-react';
import { useAdminPreferences, useUpdateAdminPreferences } from '@/hooks/useAdminPreferences';
import { useDriverAuthModeAdmin, type DriverAuthMode } from '@/hooks/useDriverAuthMode';
import { FleetControlSettingsCard } from '@/components/admin/FleetControlSettingsCard';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { cn } from '@/lib/utils';

const AUTH_MODE_OPTIONS: Array<{
  value: DriverAuthMode;
  title: string;
  description: string;
  icon: typeof Building2;
}> = [
  {
    value: 'org_managed',
    title: 'Gérée par l\'organisation',
    description: 'L\'admin crée le compte conducteur et lui communique son numéro + PIN manuellement (WhatsApp, SMS, en personne).',
    icon: Building2,
  },
  {
    value: 'yango_oauth',
    title: 'Yango OAuth',
    description: 'Le conducteur se connecte via son compte Yango Fleet. Nécessite des credentials Yango configurés.',
    icon: Smartphone,
  },
  {
    value: 'whatsapp_otp',
    title: 'WhatsApp OTP',
    description: 'Le conducteur entre son numéro, reçoit un code par WhatsApp, se connecte sans PIN.',
    icon: MessageCircle,
  },
];

export default function AdminSettings() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { data: preferences, isLoading } = useAdminPreferences();
  const updatePreferences = useUpdateAdminPreferences();
  const { data: currentMode, isLoading: modeLoading } = useDriverAuthModeAdmin();

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [newRequestAlerts, setNewRequestAlerts] = useState(true);
  const [kycAlerts, setKycAlerts] = useState(true);
  const [paymentAlerts, setPaymentAlerts] = useState(true);
  const [supportAlerts, setSupportAlerts] = useState(true);

  // Auth mode state
  const [pendingMode, setPendingMode] = useState<DriverAuthMode | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);

  useEffect(() => {
    supabase.rpc('is_platform_owner').then(({ data }) => {
      setIsPlatformOwner(!!data);
    });
  }, []);

  // Sync state with loaded preferences
  useEffect(() => {
    if (preferences) {
      setEmailNotifications(preferences.email_notifications ?? true);
      setNewRequestAlerts(preferences.new_request_alerts ?? true);
      setKycAlerts(preferences.kyc_alerts ?? true);
      setPaymentAlerts(preferences.payment_alerts ?? true);
      setSupportAlerts(preferences.support_alerts ?? true);
    }
  }, [preferences]);

  const handleSave = () => {
    updatePreferences.mutate({
      email_notifications: emailNotifications,
      new_request_alerts: newRequestAlerts,
      kyc_alerts: kycAlerts,
      payment_alerts: paymentAlerts,
      support_alerts: supportAlerts,
    });
  };

  const confirmModeChange = async () => {
    if (!pendingMode) return;
    setSavingMode(true);
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          setting_key: 'driver_auth_mode',
          setting_value: JSON.stringify(pendingMode) as unknown as never,
        }, { onConflict: 'setting_key' });
      if (error) throw error;
      logAction({ action: 'auth_mode_changed', targetType: 'session', details: { mode: pendingMode } });
      await queryClient.invalidateQueries({ queryKey: ['driver-auth-mode-admin'] });
      await queryClient.invalidateQueries({ queryKey: ['driver-auth-mode'] });
      toast.success('Mode d\'authentification mis à jour');
    } catch (e: any) {
      toast.error(e?.message || 'Erreur lors de la mise à jour');
    } finally {
      setSavingMode(false);
      setPendingMode(null);
    }
  };

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Paramètres' }]} />
      
      <AdminPageHeader
        title="Paramètres"
        description="Gérez les paramètres de l'application"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Apparence
            </CardTitle>
            <CardDescription>
              Personnalisez l'apparence de l'interface
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Mode sombre</Label>
                <p className="text-sm text-muted-foreground">
                  Activer le thème sombre
                </p>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>
              Configurez vos préférences de notification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Notifications par email</Label>
                    <p className="text-sm text-muted-foreground">
                      Recevoir les alertes par email
                    </p>
                  </div>
                  <Switch 
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Nouvelles demandes de prêt</Label>
                    <p className="text-sm text-muted-foreground">
                      Alertes pour les nouvelles demandes de prêt
                    </p>
                  </div>
                  <Switch 
                    checked={newRequestAlerts}
                    onCheckedChange={setNewRequestAlerts}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Soumissions KYC</Label>
                    <p className="text-sm text-muted-foreground">
                      Alertes pour les nouvelles vérifications KYC
                    </p>
                  </div>
                  <Switch 
                    checked={kycAlerts}
                    onCheckedChange={setKycAlerts}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Rappels de paiement</Label>
                    <p className="text-sm text-muted-foreground">
                      Alertes pour les paiements en retard
                    </p>
                  </div>
                  <Switch 
                    checked={paymentAlerts}
                    onCheckedChange={setPaymentAlerts}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Tickets de support</Label>
                    <p className="text-sm text-muted-foreground">
                      Alertes pour les nouveaux tickets de support
                    </p>
                  </div>
                  <Switch 
                    checked={supportAlerts}
                    onCheckedChange={setSupportAlerts}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Sécurité
            </CardTitle>
            <CardDescription>
              Paramètres de sécurité du compte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Délai d'expiration de session (minutes)</Label>
              <Input type="number" defaultValue="30" className="max-w-32" />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Double authentification</Label>
                <p className="text-sm text-muted-foreground">
                  Activer la 2FA pour plus de sécurité
                </p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        {/* System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Système
            </CardTitle>
            <CardDescription>
              Informations système
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Version</Label>
              <p className="text-sm font-medium">1.0.0</p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Environnement</Label>
              <p className="text-sm font-medium">Production</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Driver Authentication Mode (full-width) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Authentification Conducteurs
          </CardTitle>
          <CardDescription>
            Choisissez comment les conducteurs se connectent à l'application. Une seule méthode active à la fois.
            {!isPlatformOwner && ' (Lecture seule — réservé au Platform Owner)'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modeLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {AUTH_MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = currentMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={!isPlatformOwner || isActive}
                    onClick={() => setPendingMode(opt.value)}
                    className={cn(
                      'text-left p-4 rounded-lg border-2 transition-all',
                      isActive
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40',
                      !isPlatformOwner && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      {isActive && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{opt.title}</h3>
                    <p className="text-xs text-muted-foreground leading-snug">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={updatePreferences.isPending}>
          {updatePreferences.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enregistrer les modifications
        </Button>
      </div>

      <div className="mt-6">
        <FleetControlSettingsCard />
      </div>

      <AlertDialog open={!!pendingMode} onOpenChange={(o) => !o && setPendingMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Changer le mode d'authentification ?</AlertDialogTitle>
            <AlertDialogDescription>
              Changer le mode d'authentification déconnectera tous les conducteurs actuellement connectés.
              Ils devront se reconnecter avec la nouvelle méthode. Continuer ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingMode}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeChange} disabled={savingMode}>
              {savingMode && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
