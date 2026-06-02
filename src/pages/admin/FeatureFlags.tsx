import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  useFeatureFlags, 
  useUpdateFeatureFlag, 
  usePlatformSettings,
  useUpdatePlatformSetting,
  useIsPlatformOwner,
  useFeatureFlagAuditLogs,
  groupFlagsByCategory,
  CATEGORY_LABELS,
  FeatureFlag,
  PlatformSetting,
  FeatureFlagAuditLog
} from '@/hooks/useFeatureFlags';
import { toast } from 'sonner';
import { 
  Flag, 
  Settings, 
  Shield, 
  Lock,
  Sparkles,
  Car,
  CreditCard,
  Bell,
  Users,
  Layers,
  History,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  platform: <Shield className="h-4 w-4" />,
  loans: <CreditCard className="h-4 w-4" />,
  rentals: <Car className="h-4 w-4" />,
  scoring: <Sparkles className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  drivers: <Users className="h-4 w-4" />,
  general: <Layers className="h-4 w-4" />,
};

function FlagCard({ flag, onToggle, isUpdating }: { 
  flag: FeatureFlag; 
  onToggle: (key: string, value: boolean) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
            {flag.flag_key}
          </code>
          {flag.is_platform_only && (
            <Badge variant="secondary" className="text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Platform Only
            </Badge>
          )}
        </div>
        {flag.description && (
          <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
        )}
      </div>
      <Switch
        checked={flag.flag_value}
        onCheckedChange={(checked) => onToggle(flag.flag_key, checked)}
        disabled={isUpdating}
      />
    </div>
  );
}

function SettingCard({ setting, onSave }: { 
  setting: PlatformSetting;
  onSave: (key: string, value: Record<string, unknown>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(JSON.stringify(setting.setting_value, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(editValue);
      onSave(setting.setting_key, parsed);
      setIsEditing(false);
      setError(null);
    } catch {
      setError('JSON invalide');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
            {setting.setting_key}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? 'Annuler' : 'Modifier'}
          </Button>
        </div>
        {setting.description && (
          <CardDescription>{setting.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="font-mono text-sm"
              rows={8}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleSave} size="sm">
              Enregistrer
            </Button>
          </div>
        ) : (
          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
            {JSON.stringify(setting.setting_value, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

function AuditLogItem({ log }: { log: FeatureFlagAuditLog }) {
  return (
    <div className="flex items-start gap-3 p-3 border-b last:border-b-0">
      <div className="flex-shrink-0 mt-0.5">
        {log.new_value ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
            {log.flag_key}
          </code>
          <span className="text-xs text-muted-foreground">
            {log.old_value !== null && (
              <>
                <span className={log.old_value ? 'text-green-600' : 'text-red-600'}>
                  {log.old_value ? 'ON' : 'OFF'}
                </span>
                <span className="mx-1">→</span>
              </>
            )}
            <span className={log.new_value ? 'text-green-600' : 'text-red-600'}>
              {log.new_value ? 'ON' : 'OFF'}
            </span>
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {log.actor_email || 'Système'} • {format(new Date(log.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
        </div>
      </div>
    </div>
  );
}

export default function AdminFeatureFlags() {
  const { data: flags, isLoading: flagsLoading } = useFeatureFlags();
  const { data: settings, isLoading: settingsLoading } = usePlatformSettings();
  const { data: auditLogs, isLoading: auditLoading } = useFeatureFlagAuditLogs();
  const { data: isPlatformOwner } = useIsPlatformOwner();
  const updateFlag = useUpdateFeatureFlag();
  const updateSetting = useUpdatePlatformSetting();

  const handleToggleFlag = (flagKey: string, flagValue: boolean) => {
    updateFlag.mutate(
      { flagKey, flagValue },
      {
        onSuccess: () => {
          toast.success(`Feature flag "${flagKey}" ${flagValue ? 'activé' : 'désactivé'}`);
        },
        onError: (error) => {
          toast.error('Erreur lors de la mise à jour du flag');
          console.error(error);
        },
      }
    );
  };

  const handleSaveSetting = (settingKey: string, settingValue: Record<string, unknown>) => {
    updateSetting.mutate(
      { settingKey, settingValue },
      {
        onSuccess: () => {
          toast.success(`Paramètre "${settingKey}" mis à jour`);
        },
        onError: (error) => {
          toast.error('Erreur lors de la mise à jour du paramètre');
          console.error(error);
        },
      }
    );
  };

  const groupedFlags = flags ? groupFlagsByCategory(flags) : {};
  const categories = Object.keys(groupedFlags).sort((a, b) => {
    // Platform category first if user is platform owner
    if (a === 'platform') return -1;
    if (b === 'platform') return 1;
    return a.localeCompare(b);
  });

  return (
    <AdminLayout>
      <AdminBreadcrumb
        items={[
          { label: 'Tableau de bord', href: '/admin' },
          { label: 'Feature Flags' },
        ]}
      />

      <AdminPageHeader
        title="Feature Flags"
        description="Contrôlez l'activation des fonctionnalités de la plateforme"
      />

      {isPlatformOwner && (
        <Alert className="mb-6 border-primary/50 bg-primary/5">
          <Shield className="h-4 w-4" />
          <AlertTitle>Mode Platform Owner</AlertTitle>
          <AlertDescription>
            Vous avez accès aux flags et paramètres réservés à la plateforme.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="flags" className="space-y-6">
        <TabsList>
          <TabsTrigger value="flags" className="gap-2">
            <Flag className="h-4 w-4" />
            Feature Flags
          </TabsTrigger>
          {isPlatformOwner && settings && settings.length > 0 && (
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Platform Settings
            </TabsTrigger>
          )}
          {isPlatformOwner && (
            <TabsTrigger value="audit" className="gap-2">
              <History className="h-4 w-4" />
              Historique
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="flags" className="space-y-6">
          {flagsLoading ? (
            <LoadingSkeleton />
          ) : !flags || flags.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Aucun feature flag disponible</p>
              </CardContent>
            </Card>
          ) : (
            categories.map((category) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {CATEGORY_ICONS[category] || <Layers className="h-4 w-4" />}
                    {CATEGORY_LABELS[category] || category}
                    {category === 'platform' && (
                      <Badge variant="outline" className="ml-2">
                        <Lock className="h-3 w-3 mr-1" />
                        Réservé
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {groupedFlags[category].map((flag) => (
                    <FlagCard
                      key={flag.id}
                      flag={flag}
                      onToggle={handleToggleFlag}
                      isUpdating={updateFlag.isPending}
                    />
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {isPlatformOwner && (
          <TabsContent value="settings" className="space-y-6">
            {settingsLoading ? (
              <LoadingSkeleton />
            ) : !settings || settings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucun paramètre plateforme</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {settings.map((setting) => (
                  <SettingCard
                    key={setting.id}
                    setting={setting}
                    onSave={handleSaveSetting}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {isPlatformOwner && (
          <TabsContent value="audit" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Historique des modifications
                </CardTitle>
                <CardDescription>
                  Journal immuable de toutes les modifications de feature flags
                </CardDescription>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <LoadingSkeleton />
                ) : !auditLogs || auditLogs.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    Aucune modification enregistrée
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y">
                      {auditLogs.map((log) => (
                        <AuditLogItem key={log.id} log={log} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </AdminLayout>
  );
}
