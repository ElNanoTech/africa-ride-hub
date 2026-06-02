import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from 'next-themes';
import { Link } from 'react-router-dom';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { NAV, AUTH, KYC } from '@/lib/i18n';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { useDriverFullProfile, useUpdateDriverProfile } from '@/hooks/useDriverProfile';
import { 
  Phone, Mail, Building2, Shield, 
  Bell, Languages, Info, LogOut, ChevronRight,
  HelpCircle, Edit2, CreditCard, Calendar, Download, RotateCcw, Moon, Sun,
  Fingerprint, ScanFace, Loader2, Smartphone, ShieldCheck, ShieldX, Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  isBiometricsAvailable,
  hasBiometricCredential,
  registerBiometrics,
  removeBiometricCredential,
  getBiometricsName,
  getBiometricsIcon,
} from '@/lib/webBiometrics';
import { 
  getTrustedDeviceInfo, 
  removeDeviceTrust,
  TrustedDeviceInfo 
} from '@/lib/trustedDevice';
import { toast } from 'sonner';
import { LoginActivityList } from '@/components/LoginActivityList';
import { MVP_HIDE_DRIVER_KYC, MVP_HIDE_DRIVER_MOBILE_MONEY } from '@/lib/mvpFlags';

const kycStatusVariant = {
  pending: 'pending' as const,
  verified: 'verified' as const,
  rejected: 'rejected' as const,
  not_submitted: 'pending' as const,  // Show as pending style for not_submitted
};

const kycStatusLabel = {
  pending: KYC.STATUS_PENDING,
  verified: KYC.STATUS_VERIFIED,
  rejected: KYC.STATUS_REJECTED,
  not_submitted: 'KYC non soumis',
};

export default function Profile() {
  const { logout, driverProfile } = useDriverAuth();
  const { data: profile, isLoading } = useDriverFullProfile();
  const updateProfile = useUpdateDriverProfile();
  const { theme, setTheme } = useTheme();
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone_number: '',
    email: '',
  });
  
  // Biometric state
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsName, setBiometricsName] = useState('Biométrie');
  const [biometricsIcon, setBiometricsIcon] = useState<'fingerprint' | 'scan-face' | 'shield'>('fingerprint');
  const [biometricsLoading, setBiometricsLoading] = useState(false);
  
  // Trusted device state
  const [trustedDeviceInfo, setTrustedDeviceInfo] = useState<TrustedDeviceInfo>({ isTrusted: false, expiresAt: null, daysRemaining: null });

  // Check biometrics and trusted device on mount
  useEffect(() => {
    async function checkBiometrics() {
      const available = await isBiometricsAvailable();
      setBiometricsAvailable(available);
      setBiometricsEnabled(hasBiometricCredential());
      setBiometricsName(getBiometricsName());
      setBiometricsIcon(getBiometricsIcon());
    }
    checkBiometrics();
    
    // Check trusted device status
    setTrustedDeviceInfo(getTrustedDeviceInfo());
  }, []);

  // Open edit dialog with current values
  const handleOpenEdit = () => {
    setEditForm({
      full_name: profile?.full_name || '',
      phone_number: profile?.phone_number || '',
      email: profile?.email || '',
    });
    setIsEditDialogOpen(true);
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    await updateProfile.mutateAsync(editForm);
    setIsEditDialogOpen(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  const { toast: uiToast } = useToast();
  
  const handleResetInstallPrompt = () => {
    localStorage.removeItem('pwa-install-dismissed');
    uiToast({
      title: 'Réinitialisé',
      description: "Le bouton d'installation réapparaîtra sur l'accueil.",
    });
  };

  // Handle biometric toggle
  const handleBiometricToggle = async (enabled: boolean) => {
    if (!driverProfile?.phoneNumber) {
      toast.error('Informations de connexion manquantes');
      return;
    }

    setBiometricsLoading(true);
    try {
      if (enabled) {
        // We need the PIN to register biometrics
        // Since we don't have it stored, prompt user to re-authenticate
        toast.info('Pour activer la biométrie, déconnectez-vous et reconnectez-vous avec votre PIN.');
        setBiometricsLoading(false);
        return;
      } else {
        // Remove biometric credentials
        removeBiometricCredential();
        setBiometricsEnabled(false);
        toast.success(`${biometricsName} désactivé`);
      }
    } finally {
      setBiometricsLoading(false);
    }
  };

  // Handle revoking trusted device
  const handleRevokeTrust = () => {
    removeDeviceTrust();
    setTrustedDeviceInfo({ isTrusted: false, expiresAt: null, daysRemaining: null });
    toast.success('Appareil de confiance révoqué', {
      description: 'Vous devrez vous reconnecter à votre prochaine session.',
    });
  };

  if (isLoading) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: NAV.PROFILE }]} />
        <PageHeader title={NAV.PROFILE} />
        <div className="px-4 space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </DriverLayout>
    );
  }

  const displayName = profile?.full_name || 'Conducteur';
  const phoneNumber = profile?.phone_number || '+225 XX XX XX XX';
  const email = profile?.email || 'Non renseigné';
  const kycStatus = (profile?.kyc_status as keyof typeof kycStatusVariant) || 'pending';
  const profileImage = profile?.profile_image_url;
  const kyc = profile?.kyc;
  const memberSince = profile?.created_at 
    ? format(new Date(profile.created_at), 'MMMM yyyy', { locale: fr })
    : null;

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: NAV.PROFILE }]} />
      <PageHeader title={NAV.PROFILE} />

      {/* Profile Header */}
      <div className="px-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                {profileImage ? (
                  <AvatarImage src={profileImage} alt={displayName} />
                ) : (
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                    {displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{displayName}</h2>
                {!MVP_HIDE_DRIVER_KYC && (
                  <Badge variant={kycStatusVariant[kycStatus]} className="mt-1">
                    <Shield className="h-3 w-3 mr-1" />
                    {kycStatusLabel[kycStatus]}
                  </Badge>
                )}
                {memberSince && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Membre depuis {memberSince}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={handleOpenEdit}>
                <Edit2 className="h-5 w-5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Contact Info */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Informations de contact
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            <div className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Phone className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Téléphone</p>
                <p className="font-medium">{phoneNumber}</p>
              </div>
            </div>
            <div className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{email}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Money Info — hidden during MVP (admin manages it) */}
      {!MVP_HIDE_DRIVER_MOBILE_MONEY && (
        <div className="px-4 mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Compte mobile
          </h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {kyc && kycStatus === 'verified' ? (
                <>
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Opérateur</p>
                      <p className="font-medium">{kyc.bank_name}</p>
                    </div>
                  </div>
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Numéro mobile</p>
                      <p className="font-medium font-mono">
                        ****{kyc.bank_account_number.slice(-4)}
                      </p>
                    </div>
                  </div>
                </>
              ) : kyc && kycStatus === 'pending' ? (
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Smartphone className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Vérification en cours</p>
                    <p className="text-xs text-muted-foreground">
                      Votre KYC est en cours de vérification
                    </p>
                  </div>
                </div>
              ) : (
                <Link to="/driver/kyc" className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Non configuré</p>
                    <p className="text-xs text-muted-foreground">Complétez votre KYC</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Driver ID */}
      {profile?.yango_driver_id && (
        <div className="px-4 mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Identifiant Yango
          </h2>
          <Card>
            <CardContent className="p-4">
              <p className="font-mono text-sm text-muted-foreground">
                {profile.yango_driver_id.length > 6
                  ? `${profile.yango_driver_id.substring(0, 6)}••••••`
                  : '••••••'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Paramètres — slim */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Paramètres
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            <Link to="/driver/support" className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <HelpCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="font-medium">{NAV.SUPPORT}</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>

            <Link to="/driver/settings" className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors min-h-[48px]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Info className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="font-medium">Paramètres &amp; légal</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Device Security */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Sécurité de l'appareil
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {/* Trusted Device Status */}
            <div className="p-4">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${trustedDeviceInfo.isTrusted ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                  {trustedDeviceInfo.isTrusted ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <ShieldX className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Appareil de confiance</span>
                    {trustedDeviceInfo.isTrusted && (
                      <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        Actif
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {trustedDeviceInfo.isTrusted 
                      ? `Expire dans ${trustedDeviceInfo.daysRemaining} jour${trustedDeviceInfo.daysRemaining !== 1 ? 's' : ''}`
                      : 'Cet appareil n\'est pas mémorisé'
                    }
                  </p>
                </div>
              </div>
              
              {trustedDeviceInfo.isTrusted && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Cet appareil</p>
                      <p className="text-xs text-muted-foreground">
                        Vous restez connecté automatiquement pendant 30 jours
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                      onClick={handleRevokeTrust}
                    >
                      Révoquer
                    </Button>
                  </div>
                </div>
              )}
              
              {!trustedDeviceInfo.isTrusted && (
                <p className="mt-3 text-xs text-muted-foreground">
                  💡 Cochez "Se souvenir de cet appareil" lors de votre prochaine connexion pour rester connecté 30 jours.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Login Activity */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Historique de connexion
        </h2>
        <Card>
          <CardContent className="p-4">
            <LoginActivityList limit={5} />
          </CardContent>
        </Card>
      </div>

      {/* Logout */}
      <div className="px-4 mb-6">
        <Button 
          variant="destructive" 
          className="w-full" 
          size="lg"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 mr-2" />
          {AUTH.LOGOUT}
        </Button>
      </div>

      {/* Version */}
      <div className="px-4 mb-6 text-center">
        <p className="text-xs text-muted-foreground">
          DAM Africa v1.0.0 · Côte d'Ivoire 🇨🇮
        </p>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le profil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nom complet</Label>
              <Input
                id="full_name"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                placeholder="Votre nom complet"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone_number">Téléphone</Label>
              <Input
                id="phone_number"
                value={editForm.phone_number}
                onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                placeholder="+225 XX XX XX XX"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="email@exemple.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleSaveProfile} 
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DriverLayout>
  );
}
