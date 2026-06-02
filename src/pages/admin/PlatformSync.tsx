import { useState, useEffect, useCallback } from 'react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock, 
  Database, Wifi, WifiOff, Activity,
  Car, CreditCard, MapPin, History
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';

type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'syncing' | 'checking';

interface PlatformConnection {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: ConnectionStatus;
  lastSync: Date | null;
  nextSync: Date | null;
  dataTypes: string[];
  recordsLastSync: number;
  errorMessage?: string;
  errorCount: number;
  progressMessage?: string;
  apiVersion: string;
  healthScore: number;
  secretsConfigured: boolean;
}

const LS_KEY = 'platform_sync_state_v1';

function loadPersistedState(): Record<string, Partial<PlatformConnection>> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    Object.values(parsed).forEach((p: any) => {
      if (p?.lastSync) p.lastSync = new Date(p.lastSync);
    });
    return parsed;
  } catch {
    return {};
  }
}

function persistState(platforms: PlatformConnection[]) {
  try {
    const map: Record<string, Partial<PlatformConnection>> = {};
    platforms.forEach(p => {
      map[p.id] = {
        status: p.status === 'syncing' || p.status === 'checking' ? p.status : p.status,
        lastSync: p.lastSync,
        recordsLastSync: p.recordsLastSync,
        errorCount: p.errorCount,
        errorMessage: p.errorMessage,
        healthScore: p.healthScore,
        secretsConfigured: p.secretsConfigured,
      };
    });
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

const INITIAL_PLATFORMS: PlatformConnection[] = [
  {
    id: 'yango',
    name: 'Yango',
    description: 'Plateforme VTC - Données conducteurs et revenus',
    icon: Car,
    status: 'checking',
    lastSync: null,
    nextSync: null,
    dataTypes: ['Conducteurs', 'Courses', 'Revenus journaliers'],
    recordsLastSync: 0,
    apiVersion: 'Fleet API v2',
    healthScore: 0,
    secretsConfigured: false,
    errorCount: 0,
  },
  {
    id: 'uffizio',
    name: 'Uffizio / Trakzee',
    description: 'Télémétrie GPS - Positions et comportement de conduite',
    icon: MapPin,
    status: 'checking',
    lastSync: null,
    nextSync: null,
    dataTypes: ['Positions GPS', 'Vitesse', 'Véhicules'],
    recordsLastSync: 0,
    apiVersion: 'Trakzee API',
    healthScore: 0,
    secretsConfigured: false,
    errorCount: 0,
  },
  {
    id: 'wave',
    name: 'Wave',
    description: 'Paiements mobiles - Transactions et historique',
    icon: CreditCard,
    status: 'checking',
    lastSync: null,
    nextSync: null,
    dataTypes: ['Transactions', 'Paiements reçus'],
    recordsLastSync: 0,
    apiVersion: 'Wave API v1',
    healthScore: 0,
    secretsConfigured: false,
    errorCount: 0,
  },
];

// Translate raw error strings into user-friendly French messages
function friendlyError(raw: string, provider: 'yango' | 'uffizio' | 'wave'): string {
  const m = (raw || '').toLowerCase();
  const labels = { yango: 'Yango', uffizio: 'Uffizio', wave: 'Wave' };
  if (/403|forbidden|invalid.*(client|api).*key|invalid.*key/.test(m)) {
    return `Clé API ${labels[provider]} rejetée par le serveur (403). Régénérer la clé API et vérifier le Park ID dans la console ${labels[provider]}.`;
  }
  if (/401|unauthor/.test(m)) {
    return `Authentification ${labels[provider]} échouée (401). Vérifier les identifiants ou le token.`;
  }
  if (/404|not found/.test(m)) {
    return `Endpoint ${labels[provider]} introuvable (404). Park ID ou ressource invalide.`;
  }
  if (/429|rate.?limit/.test(m)) {
    return `Limite de débit atteinte (429) sur ${labels[provider]}. Réessayer dans quelques minutes.`;
  }
  if (/timeout|timed out|etimedout/.test(m)) {
    return `Délai d'attente dépassé en contactant ${labels[provider]}.`;
  }
  if (/network|fetch failed|enotfound|econnrefused/.test(m)) {
    return `Impossible de joindre ${labels[provider]}. Vérifier la connectivité réseau.`;
  }
  return raw || `Erreur ${labels[provider]} inconnue`;
}

export default function PlatformSync() {
  const [platforms, setPlatforms] = useState<PlatformConnection[]>(() => {
    const persisted = loadPersistedState();
    return INITIAL_PLATFORMS.map(p => ({ ...p, ...(persisted[p.id] || {}) }));
  });
  const [isSyncing, setIsSyncing] = useState<Record<string, boolean>>({});
  const [, setSelectedPlatform] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Persist state whenever platforms change (so last-sync survives reloads)
  useEffect(() => {
    persistState(platforms);
  }, [platforms]);

  const setProgress = (id: string, msg: string) => {
    setPlatforms(prev => prev.map(p => p.id === id ? { ...p, progressMessage: msg } : p));
  };

  // Check real connection status on mount
  const checkConnections = useCallback(async () => {
    setIsLoading(true);

    const [yangoResult, uffizioResult, waveResult] = await Promise.allSettled([
      checkYangoConnection(),
      checkUffizioConnection(),
      checkWaveConnection(),
    ]);

    setPlatforms(prev => prev.map(p => {
      if (p.id === 'yango') return mergeResult(p, yangoResult);
      if (p.id === 'uffizio') return mergeResult(p, uffizioResult);
      if (p.id === 'wave') return mergeResult(p, waveResult);
      return p;
    }));

    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkConnections();
  }, [checkConnections]);

  // --- Real API checks ---

  async function checkYangoConnection(fullSync = false): Promise<Partial<PlatformConnection>> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];
      const body = fullSync
        ? { date_from: weekAgo, date_to: today }
        : { date_from: today, date_to: today };

      const { data, error } = await supabase.functions.invoke('sync-yango-income', { body });

      if (error) {
        const msg = typeof error === 'object' && 'message' in error ? (error as any).message : String(error);
        if (msg.includes('YANGO_API_KEY') || msg.includes('not configured')) {
          return { status: 'disconnected', errorMessage: 'Clé API Yango non configurée', errorCount: 0, healthScore: 0, secretsConfigured: false };
        }
        return { status: 'error', errorMessage: friendlyError(msg, 'yango'), errorCount: 1, healthScore: 0, secretsConfigured: true };
      }

      if (data?.success === false) {
        return {
          status: 'error',
          errorMessage: friendlyError(data.error || 'Erreur inconnue', 'yango'),
          errorCount: 1,
          healthScore: 0,
          secretsConfigured: !String(data.error || '').includes('not configured'),
        };
      }

      const synced = data?.synced || 0;
      const errCount = data?.errors?.length || 0;
      const driversProcessed = data?.drivers_processed || 0;
      const allFailed = driversProcessed > 0 && synced === 0 && errCount > 0;
      const firstErr: string = (data?.errors && data.errors[0]) || '';

      if (allFailed) {
        return {
          status: 'error',
          healthScore: 0,
          secretsConfigured: true,
          recordsLastSync: 0,
          errorCount: errCount,
          lastSync: new Date(),
          errorMessage: friendlyError(firstErr, 'yango'),
        };
      }

      const partialFailure = errCount > 0;
      return {
        status: partialFailure ? 'error' : 'connected',
        healthScore: partialFailure ? Math.max(0, Math.round(100 * (1 - errCount / Math.max(driversProcessed, 1)))) : 100,
        secretsConfigured: true,
        recordsLastSync: synced,
        errorCount: errCount,
        lastSync: new Date(),
        errorMessage: partialFailure ? `${errCount}/${driversProcessed} conducteurs en échec — ${friendlyError(firstErr, 'yango')}` : undefined,
      };
    } catch (e: any) {
      return { status: 'error', errorMessage: friendlyError(e.message || '', 'yango'), errorCount: 1, healthScore: 0 };
    }
  }

  async function checkUffizioConnection(fullSync = false): Promise<Partial<PlatformConnection>> {
    try {
      const body = fullSync ? { action: 'syncTelemetry' } : { action: 'getLiveVehicles' };
      const { data, error } = await supabase.functions.invoke('sync-uffizio', { body });

      if (error) {
        const msg = typeof error === 'object' && 'message' in error ? (error as any).message : String(error);
        if (msg.includes('UFFIZIO') || msg.includes('not configured')) {
          return { status: 'disconnected', errorMessage: 'Identifiants Uffizio non configurés', errorCount: 0, healthScore: 0, secretsConfigured: false };
        }
        return { status: 'error', errorMessage: friendlyError(msg, 'uffizio'), errorCount: 1, healthScore: 0, secretsConfigured: true };
      }

      if (data?.success === false) {
        return {
          status: 'error',
          errorMessage: friendlyError(data.error || 'Erreur de connexion Uffizio', 'uffizio'),
          errorCount: 1,
          healthScore: 0,
          secretsConfigured: !String(data.error || '').includes('not configured'),
        };
      }

      if (fullSync) {
        const upserted = data?.telemetry_upserted || 0;
        const gpsVehicles = data?.gps_vehicles || 0;
        return {
          status: gpsVehicles > 0 ? 'connected' : 'error',
          healthScore: gpsVehicles > 0 ? 100 : 0,
          secretsConfigured: true,
          recordsLastSync: upserted,
          errorCount: gpsVehicles === 0 ? 1 : 0,
          lastSync: new Date(),
          errorMessage: gpsVehicles === 0
            ? 'Session Uffizio active mais 0 véhicule remonté en direct. Vérifier que les boîtiers GPS reportent et que le compte a des appareils actifs.'
            : undefined,
        };
      }

      const vehicleCount = data?.vehicles?.length || data?.count || 0;
      const fromCache = data?.source === 'cache' || data?.method === 'cache';
      const cacheAgeSec = data?.cache_age_seconds || 0;
      const staleCache = fromCache && cacheAgeSec > 24 * 3600;

      return {
        status: vehicleCount > 0 && !staleCache ? 'connected' : 'error',
        healthScore: vehicleCount > 0 && !staleCache ? 100 : vehicleCount > 0 ? 40 : 0,
        secretsConfigured: true,
        recordsLastSync: vehicleCount,
        errorCount: vehicleCount === 0 ? 1 : 0,
        lastSync: new Date(),
        errorMessage: vehicleCount === 0
          ? 'Aucun véhicule retourné. Vérifier les identifiants et l\'activité du compte Uffizio.'
          : staleCache
            ? `Données en cache (${Math.floor(cacheAgeSec / 86400)}j). L'API live ne répond plus — relancer une synchronisation.`
            : undefined,
      };
    } catch (e: any) {
      return { status: 'error', errorMessage: friendlyError(e.message || '', 'uffizio'), errorCount: 1, healthScore: 0 };
    }
  }

  async function checkWaveConnection(): Promise<Partial<PlatformConnection>> {
    try {
      const { data, error } = await supabase.functions.invoke('check-wave-payments', { body: {} });

      if (error) {
        const msg = typeof error === 'object' && 'message' in error ? (error as any).message : String(error);
        if (msg.includes('WAVE_API_KEY') || msg.includes('not configured')) {
          return { status: 'disconnected', errorMessage: 'Clé API Wave non configurée', errorCount: 0, healthScore: 0, secretsConfigured: false };
        }
        return { status: 'error', errorMessage: friendlyError(msg, 'wave'), errorCount: 1, healthScore: 0, secretsConfigured: true };
      }

      if (data?.success === false) {
        return {
          status: 'error',
          errorMessage: friendlyError(data.error || 'Erreur de connexion Wave', 'wave'),
          errorCount: 1,
          healthScore: 0,
          secretsConfigured: !String(data.error || '').includes('not configured'),
        };
      }

      return {
        status: 'connected',
        healthScore: 100,
        secretsConfigured: true,
        recordsLastSync: data?.checked || 0,
        errorCount: 0,
        lastSync: new Date(),
      };
    } catch (e: any) {
      return { status: 'error', errorMessage: friendlyError(e.message || '', 'wave'), errorCount: 1, healthScore: 0 };
    }
  }

  function mergeResult(platform: PlatformConnection, result: PromiseSettledResult<Partial<PlatformConnection>>): PlatformConnection {
    if (result.status === 'rejected') {
      return { ...platform, status: 'error', errorMessage: friendlyError(result.reason?.message || '', platform.id as any), errorCount: (platform.errorCount || 0) + 1, healthScore: 0, progressMessage: undefined };
    }
    return { ...platform, ...result.value, progressMessage: undefined };
  }

  // --- Re-sync handler with real-time progress ---
  const handleSync = async (platformId: string, fullSync = true) => {
    setIsSyncing(prev => ({ ...prev, [platformId]: true }));
    setPlatforms(prev => prev.map(p => p.id === platformId ? { ...p, status: 'syncing' as const, progressMessage: 'Connexion à l\'API...' } : p));

    const phases = [
      'Connexion à l\'API...',
      'Authentification...',
      'Récupération des données...',
      'Traitement et enregistrement...',
    ];
    let phaseIdx = 0;
    const ticker = setInterval(() => {
      phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
      setProgress(platformId, phases[phaseIdx]);
    }, 1500);

    let result: Partial<PlatformConnection>;
    try {
      if (platformId === 'yango') {
        result = await checkYangoConnection(fullSync);
      } else if (platformId === 'uffizio') {
        result = await checkUffizioConnection(fullSync);
      } else {
        result = await checkWaveConnection();
      }
    } finally {
      clearInterval(ticker);
    }

    setPlatforms(prev => prev.map(p => p.id === platformId ? { ...p, ...result, progressMessage: undefined } : p));
    setIsSyncing(prev => ({ ...prev, [platformId]: false }));

    const name = platforms.find(p => p.id === platformId)?.name;
    if (result.status === 'connected') {
      toast.success(`${name} : synchronisation réussie`, {
        description: `${result.recordsLastSync || 0} enregistrement(s)`,
      });
    } else {
      toast.error(`${name} : échec`, { description: result.errorMessage });
    }
  };

  // --- Helpers ---
  const formatTimeAgo = (date: Date | null) => {
    if (!date) return 'Jamais';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    return `Il y a ${Math.floor(diff / 86400)} j`;
  };

  const getStatusBadge = (status: ConnectionStatus) => {
    const config = {
      connected: { label: 'Connecté', variant: 'default' as const, className: 'bg-green-500' },
      disconnected: { label: 'Non configuré', variant: 'secondary' as const, className: '' },
      error: { label: 'Erreur', variant: 'destructive' as const, className: '' },
      syncing: { label: 'Sync...', variant: 'outline' as const, className: 'animate-pulse' },
      checking: { label: 'Vérification...', variant: 'outline' as const, className: 'animate-pulse' },
    };
    const { label, variant, className } = config[status];
    return <Badge variant={variant} className={className}>{label}</Badge>;
  };

  const getStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'syncing':
      case 'checking': return <RefreshCw className="h-5 w-5 text-primary animate-spin" />;
      case 'error': return <XCircle className="h-5 w-5 text-destructive" />;
      default: return <WifiOff className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const connectedCount = platforms.filter(p => p.status === 'connected').length;
  const errorCount = platforms.filter(p => p.status === 'error').length;
  const disconnectedCount = platforms.filter(p => p.status === 'disconnected').length;
  const overallHealth = platforms.length > 0
    ? Math.round(platforms.reduce((acc, p) => acc + p.healthScore, 0) / platforms.length)
    : 0;

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Synchronisation Plateformes' }]} />
      
      <AdminPageHeader 
        title="Synchronisation des Plateformes"
        description="État réel des connexions API avec les services externes"
        action={
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => checkConnections()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            {isLoading ? 'Vérification...' : 'Tout vérifier'}
          </Button>
        }
      />

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                {isLoading ? <Skeleton className="h-7 w-8" /> : <p className="text-2xl font-bold">{platforms.length}</p>}
                <p className="text-xs text-muted-foreground">Plateformes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Wifi className="h-5 w-5 text-green-500" />
              </div>
              <div>
                {isLoading ? <Skeleton className="h-7 w-8" /> : <p className="text-2xl font-bold text-green-600">{connectedCount}</p>}
                <p className="text-xs text-muted-foreground">Connectées</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                {isLoading ? <Skeleton className="h-7 w-8" /> : <p className="text-2xl font-bold text-destructive">{errorCount + disconnectedCount}</p>}
                <p className="text-xs text-muted-foreground">En erreur / Non configuré</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-secondary" />
              </div>
              <div>
                {isLoading ? <Skeleton className="h-7 w-8" /> : <p className="text-2xl font-bold">{overallHealth}%</p>}
                <p className="text-xs text-muted-foreground">Santé globale</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Cards */}
      <div className="space-y-4">
        {platforms.map(platform => (
          <Card 
            key={platform.id}
            className={cn(
              'transition-all',
              platform.status === 'error' && 'border-destructive/50',
              platform.status === 'disconnected' && 'border-amber-500/30 opacity-75',
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center',
                    platform.status === 'connected' ? 'bg-primary/10' : 
                    platform.status === 'error' ? 'bg-destructive/10' : 'bg-muted'
                  )}>
                    <platform.icon className={cn(
                      'h-6 w-6',
                      platform.status === 'connected' ? 'text-primary' :
                      platform.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                    )} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{platform.name}</h3>
                      {getStatusBadge(platform.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{platform.description}</p>
                  </div>
                </div>
                {getStatusIcon(platform.status)}
              </div>

              {platform.errorMessage && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-start gap-2 text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span>{platform.errorMessage}</span>
                      {platform.errorCount > 0 && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">
                          {platform.errorCount} erreur{platform.errorCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {platform.status === 'syncing' && platform.progressMessage && (
                <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 text-primary text-sm">
                    <RefreshCw className="h-4 w-4 flex-shrink-0 animate-spin" />
                    <span>{platform.progressMessage}</span>
                  </div>
                </div>
              )}

              {platform.status === 'disconnected' && (
                <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>Les secrets API pour cette plateforme ne sont pas configurés. Contactez l'administrateur système.</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Dernière synchro</p>
                  <p className="text-sm font-medium">{formatTimeAgo(platform.lastSync)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Enregistrements</p>
                  <p className="text-sm font-medium">{platform.recordsLastSync.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Erreurs</p>
                  <p className={cn('text-sm font-medium', platform.errorCount > 0 ? 'text-destructive' : '')}>
                    {platform.errorCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Secrets</p>
                  <p className="text-sm font-medium">
                    {platform.status === 'checking' ? '...' : platform.secretsConfigured ? '✅ Configurés' : '❌ Manquants'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex flex-wrap gap-1">
                  {platform.dataTypes.map((type, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-2"
                    disabled={isSyncing[platform.id] || platform.status === 'checking'}
                    onClick={() => handleSync(platform.id, false)}
                    title="Tester sans déclencher de synchronisation complète"
                  >
                    <Activity className="h-4 w-4" />
                    Tester
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-2"
                    disabled={isSyncing[platform.id] || platform.status === 'checking' || platform.status === 'disconnected'}
                    onClick={() => handleSync(platform.id, true)}
                  >
                    <RefreshCw className={cn('h-4 w-4', isSyncing[platform.id] && 'animate-spin')} />
                    {isSyncing[platform.id] ? 'Sync...' : 'Re-sync now'}
                  </Button>
                </div>
              </div>

              {/* Health Bar */}
              {platform.status !== 'checking' && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Santé de la connexion</span>
                    <span className={cn(
                      'text-xs font-medium',
                      platform.healthScore >= 80 ? 'text-green-600' :
                      platform.healthScore >= 50 ? 'text-amber-600' : 'text-destructive'
                    )}>
                      {platform.healthScore}%
                    </span>
                  </div>
                  <Progress 
                    value={platform.healthScore} 
                    className={cn(
                      'h-2',
                      platform.healthScore >= 80 ? '[&>div]:bg-green-500' :
                      platform.healthScore >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-destructive'
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
