import { useState, useCallback } from 'react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { VehicleTrackingMap } from '@/components/VehicleTrackingMap';
import { TripHistoryReplay } from '@/components/TripHistoryReplay';
import { GeofenceAlerts } from '@/components/GeofenceAlerts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  MapPin, Car, Navigation, Clock, Search, 
  RefreshCw, Maximize2, TrendingUp, AlertTriangle,
  XCircle, Activity, Route, Shield, CheckCircle, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUffizioLiveData, type UffizioVehicle } from '@/hooks/useUffizioLiveData';

export default function AdminTracking() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('live');
  const [activeGeofenceIds, setActiveGeofenceIds] = useState<string[]>([]);

  const { vehicles, loading, error, lastRefresh, refresh, stats, connectionStatus } = useUffizioLiveData({
    autoRefresh: true,
    refreshInterval: 300000, // 5 min API sync; Realtime pushes in between
  });

  const handleZoneToggle = useCallback((zoneId: string, active: boolean) => {
    setActiveGeofenceIds(prev => 
      active ? [...prev, zoneId] : prev.filter(id => id !== zoneId)
    );
  }, []);

  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = 
      vehicle.vehicle_no.toLowerCase().includes(search.toLowerCase()) ||
      vehicle.driver_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const avgSpeed = stats.moving > 0 
    ? Math.round(vehicles.filter(v => v.status === 'moving').reduce((acc, v) => acc + v.speed, 0) / stats.moving) 
    : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'moving': return <Activity className="h-4 w-4 text-green-500" />;
      case 'idle': return <Clock className="h-4 w-4 text-amber-500" />;
      case 'offline': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const mapVehicles = vehicles.filter(v => v.lat !== 0 && v.lng !== 0).map(v => ({
    id: v.id,
    driverName: v.vehicle_no,
    licensePlate: v.vehicle_no,
    lat: v.lat,
    lng: v.lng,
  }));

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Suivi en temps réel' }]} />
      
      <AdminPageHeader 
        title="Suivi GPS en Temps Réel"
        description={`${stats.total} véhicules connectés via Uffizio/Trakzee`}
        action={
          <div className="flex gap-2 items-center">
            {/* Connection freshness badge */}
            <Badge 
              variant="outline" 
              className={cn(
                'text-xs gap-1.5',
                connectionStatus === 'live' && 'border-green-500/50 text-green-600',
                connectionStatus === 'delayed' && 'border-amber-500/50 text-amber-600',
                connectionStatus === 'offline' && 'border-red-500/50 text-red-600',
              )}
            >
              <div className={cn(
                'w-2 h-2 rounded-full',
                connectionStatus === 'live' && 'bg-green-500 animate-pulse',
                connectionStatus === 'delayed' && 'bg-amber-500',
                connectionStatus === 'offline' && 'bg-red-500',
              )} />
              {connectionStatus === 'live' && 'Live'}
              {connectionStatus === 'delayed' && 'Retardé'}
              {connectionStatus === 'offline' && 'Hors ligne'}
            </Badge>
            {lastRefresh && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Màj: {lastRefresh.toLocaleTimeString('fr-FR')}
              </span>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualiser
            </Button>
            <Button 
              variant="outline" size="sm" className="gap-2"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              <Maximize2 className="h-4 w-4" />
              {isFullscreen ? 'Réduire' : 'Plein écran'}
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="live" className="gap-2">
            <Activity className="h-4 w-4" />
            Temps Réel
          </TabsTrigger>
          <TabsTrigger value="geofencing" className="gap-2">
            <Shield className="h-4 w-4" />
            Géorepérage
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Route className="h-4 w-4" />
            Historique
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="live" className="mt-6">
          {/* Error banner */}
          {error && (
            <Card className="mb-6 border-destructive/50 bg-destructive/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Erreur de connexion Uffizio</p>
                    <p className="text-xs text-muted-foreground mt-1">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Car className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    {loading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold">{stats.total}</p>}
                    <p className="text-xs text-muted-foreground">Total véhicules</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    {loading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold text-green-600">{stats.moving}</p>}
                    <p className="text-xs text-muted-foreground">En mouvement</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    {loading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold text-amber-600">{stats.idle}</p>}
                    <p className="text-xs text-muted-foreground">À l'arrêt</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    {loading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold text-red-600">{stats.offline}</p>}
                    <p className="text-xs text-muted-foreground">Hors ligne</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    {loading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold">{avgSpeed} <span className="text-sm font-normal">km/h</span></p>}
                    <p className="text-xs text-muted-foreground">Vitesse moyenne</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className={cn('grid gap-6', isFullscreen ? 'grid-cols-1' : 'lg:grid-cols-3')}>
            {/* Map Section */}
            <div className={cn(isFullscreen ? 'col-span-1' : 'lg:col-span-2')}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Carte en direct
                    <Badge variant="outline" className="ml-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1" />
                      LIVE
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <VehicleTrackingMap 
                    height={isFullscreen ? '70vh' : '500px'}
                    vehicles={vehicles}
                    selectedVehicleId={selectedVehicle || undefined}
                    onVehicleSelect={(v) => setSelectedVehicle(v.id)}
                    showGeofences={false}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Vehicle List */}
            {!isFullscreen && (
              <div className="lg:col-span-1">
                <Card className="h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                      <Car className="h-5 w-5" />
                      Véhicules ({filteredVehicles.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="space-y-3 mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Rechercher plaque ou nom..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Tous les statuts" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous ({stats.total})</SelectItem>
                          <SelectItem value="moving">En mouvement ({stats.moving})</SelectItem>
                          <SelectItem value="idle">À l'arrêt ({stats.idle})</SelectItem>
                          <SelectItem value="offline">Hors ligne ({stats.offline})</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {loading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 w-full rounded-lg" />
                          ))
                        ) : filteredVehicles.map(vehicle => (
                          <div 
                            key={vehicle.id}
                            onClick={() => setSelectedVehicle(vehicle.id)}
                            className={cn(
                              'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md',
                              selectedVehicle === vehicle.id 
                                ? 'border-primary bg-primary/5' 
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Car className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm truncate max-w-[140px]">{vehicle.vehicle_no}</span>
                              </div>
                              {getStatusIcon(vehicle.status)}
                            </div>

                            <div className="text-xs text-muted-foreground space-y-1">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1">
                                  <Navigation className="h-3 w-3" />
                                  <span>{vehicle.speed} km/h</span>
                                </div>
                              </div>
                              {/* Per-vehicle freshness indicator */}
                              <div className="flex items-center gap-1 pt-1">
                                <Clock className="h-3 w-3" />
                                <span className={cn(
                                  'truncate',
                                  (() => {
                                    const ts = vehicle.synced_at || vehicle.last_update;
                                    if (!ts) return 'text-red-500';
                                    const age = Date.now() - new Date(ts).getTime();
                                    if (age < 300000) return 'text-green-600';
                                    if (age < 900000) return 'text-amber-600';
                                    return 'text-red-500';
                                  })()
                                )}>
                                  {(() => {
                                    const ts = vehicle.synced_at || vehicle.last_update;
                                    if (!ts) return 'Pas de signal';
                                    try {
                                      const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
                                      if (diff < 60) return 'À l\'instant';
                                      if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
                                      if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
                                      return `Il y a ${Math.floor(diff / 86400)} j`;
                                    } catch { return ts; }
                                  })()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}

                        {!loading && filteredVehicles.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Car className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Aucun véhicule trouvé</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Live data notice */}
          <Card className={cn(
            'mt-6',
            connectionStatus === 'live' && 'border-green-500/50 bg-green-500/5',
            connectionStatus === 'delayed' && 'border-amber-500/50 bg-amber-500/5',
            connectionStatus === 'offline' && 'border-red-500/50 bg-red-500/5',
          )}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {connectionStatus === 'live' && <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />}
                {connectionStatus === 'delayed' && <Clock className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />}
                {connectionStatus === 'offline' && <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />}
                <div>
                  <p className="font-medium text-sm">
                    {connectionStatus === 'live' && 'Données live — Temps réel'}
                    {connectionStatus === 'delayed' && 'Données retardées — Dernière sync > 5 min'}
                    {connectionStatus === 'offline' && 'Connexion perdue — Dernière sync > 15 min'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Les positions sont synchronisées via l'API GPS et poussées en temps réel via WebSocket. 
                    Sync API toutes les 5 minutes, mises à jour instantanées entre les syncs.
                    {lastRefresh && ` Dernière mise à jour: ${lastRefresh.toLocaleTimeString('fr-FR')}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Geofencing Tab */}
        <TabsContent value="geofencing" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Zones de Géorepérage
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <VehicleTrackingMap 
                    height="500px"
                    vehicles={vehicles}
                    showGeofences={true}
                    activeGeofenceIds={activeGeofenceIds}
                    showLegend={false}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <GeofenceAlerts />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="history" className="mt-6">
          <TripHistoryReplay height="500px" />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
