import { useState, useMemo } from 'react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity, AlertTriangle, Gauge, Clock, Car, TrendingUp,
  RefreshCw, Search, Zap, PauseCircle, ShieldAlert, Navigation,
  ArrowUpDown, Eye, Shield
} from 'lucide-react';
import { useDrivingBehavior, type VehicleBehavior } from '@/hooks/useDrivingBehavior';
import { GeofenceAlerts } from '@/components/GeofenceAlerts';
import { cn } from '@/lib/utils';

export default function DrivingBehavior() {
  const [dateRange, setDateRange] = useState('7d');
  const [search, setSearch] = useState('');
  const [behaviorFilter, setBehaviorFilter] = useState('all');

  const fromDate = useMemo(() => {
    const now = new Date();
    const days = dateRange === '1d' ? 1 : dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 7;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }, [dateRange]);

  const toDate = new Date().toISOString().split('T')[0];

  const { data, isLoading, error, refetch, isFetching } = useDrivingBehavior({ fromDate, toDate });

  const filteredBehavior = useMemo(() => {
    if (!data?.vehicle_behavior) return [];
    let result = data.vehicle_behavior;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(v =>
        v.vehicle_no.toLowerCase().includes(q) ||
        v.driver_name.toLowerCase().includes(q)
      );
    }

    if (behaviorFilter === 'overspeeding') {
      result = result.filter(v => v.is_overspeeding);
    } else if (behaviorFilter === 'idle') {
      result = result.filter(v => v.is_idle_engine_on);
    } else if (behaviorFilter === 'moving') {
      result = result.filter(v => v.status === 'moving');
    } else if (behaviorFilter === 'parked') {
      result = result.filter(v => v.status === 'parked');
    }

    return result;
  }, [data, search, behaviorFilter]);

  const summary = data?.summary;

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Comportement de Conduite' }]} />
      <AdminPageHeader
        title="Comportement de Conduite"
        description="Suivi en temps réel du comportement des conducteurs et analyse des événements"
        action={
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Dernières 24h</SelectItem>
                <SelectItem value="7d">7 derniers jours</SelectItem>
                <SelectItem value="30d">30 derniers jours</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      {/* Error State */}
      {error && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-destructive">Erreur de chargement des données GPS</p>
              <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Navigation className="h-4 w-4 text-primary" />
                </div>
                <p className="text-2xl font-bold">{summary?.currently_moving || 0}</p>
                <p className="text-xs text-muted-foreground">En mouvement</p>
              </CardContent>
            </Card>
            <Card className={summary?.currently_overspeeding ? 'border-destructive/50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                </div>
                <p className="text-2xl font-bold text-destructive">{summary?.currently_overspeeding || 0}</p>
                <p className="text-xs text-muted-foreground">Excès de vitesse</p>
              </CardContent>
            </Card>
            <Card className={summary?.currently_idle_engine_on ? 'border-warning/50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <PauseCircle className="h-4 w-4 text-warning" />
                </div>
                <p className="text-2xl font-bold">{summary?.currently_idle_engine_on || 0}</p>
                <p className="text-xs text-muted-foreground">Moteur au ralenti</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="h-4 w-4 text-secondary" />
                </div>
                <p className="text-2xl font-bold">{summary?.avg_speed_moving || 0} <span className="text-sm font-normal">km/h</span></p>
                <p className="text-xs text-muted-foreground">Vitesse moy.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <p className="text-2xl font-bold">{summary?.max_speed_fleet || 0} <span className="text-sm font-normal">km/h</span></p>
                <p className="text-xs text-muted-foreground">Vitesse max.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{summary?.total_trips || 0}</p>
                <p className="text-xs text-muted-foreground">Trajets (période)</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Overspeeding Alert Banner */}
      {summary?.overspeeding_vehicles && summary.overspeeding_vehicles.length > 0 && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-destructive">⚠️ Excès de vitesse détectés en ce moment</p>
              <p className="text-xs text-muted-foreground mt-1">
                Véhicules en excès : {summary.overspeeding_vehicles.join(', ')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="live" className="space-y-4">
        <TabsList>
          <TabsTrigger value="live" className="gap-1.5">
            <Eye className="h-4 w-4" /> Temps réel
          </TabsTrigger>
          <TabsTrigger value="trips" className="gap-1.5">
            <Navigation className="h-4 w-4" /> Trajets
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Événements
          </TabsTrigger>
          <TabsTrigger value="geofence" className="gap-1.5">
            <Shield className="h-4 w-4" /> Géorepérage
          </TabsTrigger>
        </TabsList>

        {/* Live Vehicle Behavior Tab */}
        <TabsContent value="live" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher véhicule ou conducteur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={behaviorFilter} onValueChange={setBehaviorFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous ({data?.vehicle_behavior?.length || 0})</SelectItem>
                <SelectItem value="moving">En mouvement ({data?.vehicle_behavior?.filter(v => v.status === 'moving').length || 0})</SelectItem>
                <SelectItem value="overspeeding">Excès de vitesse ({data?.vehicle_behavior?.filter(v => v.is_overspeeding).length || 0})</SelectItem>
                <SelectItem value="idle">Moteur au ralenti ({data?.vehicle_behavior?.filter(v => v.is_idle_engine_on).length || 0})</SelectItem>
                <SelectItem value="parked">Stationnés ({data?.vehicle_behavior?.filter(v => v.status === 'parked').length || 0})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Véhicule</TableHead>
                    <TableHead>Conducteur</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Vitesse</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Alertes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredBehavior.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Aucun véhicule trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBehavior.map((v, i) => (
                      <TableRow key={i} className={v.is_overspeeding ? 'bg-destructive/5' : ''}>
                        <TableCell className="font-medium">{v.vehicle_no || '—'}</TableCell>
                        <TableCell>{v.driver_name || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={
                            v.status === 'moving' ? 'active' :
                            v.status === 'idle' ? 'pending' : 'secondary'
                          }>
                            {v.status === 'moving' ? 'En mouvement' :
                             v.status === 'idle' ? 'Ralenti' : 'Stationné'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            'font-semibold',
                            v.current_speed > 80 ? 'text-destructive' :
                            v.current_speed > 60 ? 'text-warning' : 'text-foreground'
                          )}>
                            {v.current_speed} km/h
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={v.ignition === '1' || v.ignition === 'ON' ? 'active' : 'secondary'}>
                            {v.ignition === '1' || v.ignition === 'ON' ? 'ON' : 'OFF'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {v.is_overspeeding && (
                              <Badge variant="destructive" className="text-[10px] px-1.5">
                                ⚡ Vitesse
                              </Badge>
                            )}
                            {v.is_idle_engine_on && (
                              <Badge variant="pending" className="text-[10px] px-1.5">
                                🔥 Ralenti
                              </Badge>
                            )}
                            {!v.is_overspeeding && !v.is_idle_engine_on && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Trips Tab */}
        <TabsContent value="trips" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Historique des Trajets ({data?.trips?.length || 0})</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Véhicule</TableHead>
                    <TableHead>Début</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Vit. Max</TableHead>
                    <TableHead>Vit. Moy</TableHead>
                    <TableHead>Durée</TableHead>
                    <TableHead>Ralenti</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.trips && data.trips.length > 0 ? (
                    data.trips.slice(0, 50).map((trip, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{trip.vehicle_no}</TableCell>
                        <TableCell className="text-xs">{trip.start_time}</TableCell>
                        <TableCell className="text-xs">{trip.end_time}</TableCell>
                        <TableCell>{trip.distance_km.toFixed(1)} km</TableCell>
                        <TableCell className={trip.max_speed > 80 ? 'text-destructive font-semibold' : ''}>
                          {trip.max_speed} km/h
                        </TableCell>
                        <TableCell>{trip.avg_speed} km/h</TableCell>
                        <TableCell>{trip.duration_minutes} min</TableCell>
                        <TableCell className={trip.idle_time > 30 ? 'text-warning font-semibold' : ''}>
                          {trip.idle_time} min
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {isLoading ? 'Chargement...' : 'Aucun trajet trouvé pour cette période. Les données de trajets seront disponibles quand l\'API Uffizio retournera des rapports.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Overspeeding Events */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  Excès de vitesse ({data?.overspeeding?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data?.overspeeding && data.overspeeding.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto">
                    {data.overspeeding.slice(0, 20).map((evt, i) => (
                      <div key={i} className="px-4 py-3 border-b last:border-0 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{evt.vehicle_no}</p>
                            <p className="text-xs text-muted-foreground">{evt.location || evt.datetime}</p>
                          </div>
                          <Badge variant="destructive">{evt.speed} km/h</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Chargement...' : 'Aucun événement de vitesse excessive'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Harsh Events */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Freinages/Accélérations brusques ({data?.harsh_events?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data?.harsh_events && data.harsh_events.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto">
                    {data.harsh_events.slice(0, 20).map((evt, i) => (
                      <div key={i} className="px-4 py-3 border-b last:border-0 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{evt.vehicle_no}</p>
                            <p className="text-xs text-muted-foreground">{evt.event_type} · {evt.datetime}</p>
                          </div>
                          <Badge variant={evt.severity === 'high' ? 'destructive' : 'pending'}>
                            {evt.speed} km/h
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Chargement...' : 'Aucun événement de conduite brusque'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Idle Events */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PauseCircle className="h-4 w-4 text-warning" />
                  Ralentis prolongés ({data?.idle_events?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data?.idle_events && data.idle_events.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto">
                    {data.idle_events.slice(0, 20).map((evt, i) => (
                      <div key={i} className="px-4 py-3 border-b last:border-0 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{evt.vehicle_no}</p>
                            <p className="text-xs text-muted-foreground">{evt.location || `${evt.start_time} — ${evt.end_time}`}</p>
                          </div>
                          <Badge variant={evt.duration_minutes > 30 ? 'destructive' : 'pending'}>
                            {evt.duration_minutes} min
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Chargement...' : 'Aucun événement de ralenti prolongé'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Data source info */}
          {data?.raw_responses && Object.keys(data.raw_responses).length > 0 && (
            <Card>
              <CardContent className="p-4 text-xs text-muted-foreground">
                <p className="font-medium mb-1">Sources de données GPS :</p>
                {Object.entries(data.raw_responses).map(([key, endpoint]) => (
                  <p key={key}>• {key}: {endpoint as string}</p>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Geofence Tab */}
        <TabsContent value="geofence" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GeofenceAlerts />
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium text-foreground mb-2">Synchronisation automatique active</p>
                <p className="text-sm">
                  Les positions GPS sont vérifiées automatiquement toutes les 15 minutes.
                  Les alertes de sortie de zone sont créées et les conducteurs notifiés instantanément.
                </p>
                <p className="text-xs mt-3">
                  Les données de télémétrie alimentent directement le DAM Score (composante conduite = 25% du score).
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
