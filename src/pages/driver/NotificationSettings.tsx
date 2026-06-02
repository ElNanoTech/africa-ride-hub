import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { HapticButton } from '@/components/HapticButton';
import { NAV } from '@/lib/i18n';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { toast } from 'sonner';
import { 
  Bell, 
  Volume2, 
  Vibrate, 
  MessageSquare,
  RotateCcw,
  Play
} from 'lucide-react';

export default function NotificationSettings() {
  const { preferences, updatePreference, resetPreferences } = useNotificationPreferences();
  const { playNotificationSound } = useNotificationSound();
  const haptic = useHapticFeedback();

  const handleTestSound = () => {
    if (preferences.soundEnabled) {
      playNotificationSound();
      toast.success('Son de notification joué');
    } else {
      toast.info('Le son est désactivé');
    }
  };

  const handleTestVibration = () => {
    if (preferences.vibrationEnabled && 'vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
      toast.success('Vibration testée');
    } else if (!('vibrate' in navigator)) {
      toast.info('Vibration non supportée sur cet appareil');
    } else {
      toast.info('La vibration est désactivée');
    }
  };

  const handleReset = () => {
    resetPreferences();
    toast.success('Préférences réinitialisées');
  };

  return (
    <DriverLayout>
      <DriverBreadcrumb 
        items={[
          { label: NAV.PROFILE, href: '/driver/profile' },
          { label: 'Notifications' }
        ]} 
      />
      <PageHeader 
        title="Préférences de notification"
        subtitle="Personnalisez vos alertes"
      />

      <div className="px-4 pb-6 space-y-4">
        {/* Main Settings Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Alertes en temps réel</CardTitle>
                <CardDescription>
                  Recevez des notifications pour les paiements et mises à jour de score
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-0 divide-y divide-border">
            {/* Sound Toggle */}
            <div className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Volume2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Son de notification</p>
                  <p className="text-sm text-muted-foreground">
                    Jouer un son lors de nouvelles notifications
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.soundEnabled}
                onCheckedChange={(checked) => {
                  haptic.selection();
                  updatePreference('soundEnabled', checked);
                }}
              />
            </div>

            {/* Vibration Toggle */}
            <div className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Vibrate className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Vibration</p>
                  <p className="text-sm text-muted-foreground">
                    Vibrer lors de nouvelles notifications
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.vibrationEnabled}
                onCheckedChange={(checked) => {
                  haptic.selection();
                  updatePreference('vibrationEnabled', checked);
                }}
              />
            </div>

            {/* Toast Toggle */}
            <div className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Messages popup</p>
                  <p className="text-sm text-muted-foreground">
                    Afficher les notifications en haut de l'écran
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.toastEnabled}
                onCheckedChange={(checked) => {
                  haptic.selection();
                  updatePreference('toastEnabled', checked);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Test Section */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Tester les notifications</CardTitle>
            <CardDescription>
              Vérifiez que vos paramètres fonctionnent correctement
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <HapticButton 
              variant="outline" 
              className="flex-1"
              onClick={handleTestSound}
              hapticType="light"
            >
              <Play className="h-4 w-4 mr-2" />
              Tester le son
            </HapticButton>
            <HapticButton 
              variant="outline" 
              className="flex-1"
              onClick={handleTestVibration}
              hapticType="medium"
            >
              <Vibrate className="h-4 w-4 mr-2" />
              Tester la vibration
            </HapticButton>
          </CardContent>
        </Card>

        {/* Reset Button */}
        <Button 
          variant="ghost" 
          className="w-full"
          onClick={handleReset}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Réinitialiser les préférences
        </Button>
      </div>
    </DriverLayout>
  );
}
