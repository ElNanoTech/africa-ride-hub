import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertTriangle, MapPin, Bell, BellOff, Clock, 
  Car, Shield, Trash2, Eye, EyeOff, CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQuery } from '@tanstack/react-query';

// Geofence zone types
export interface GeofenceZone {
  id: string;
  name: string;
  zone_type: string;
  center_lat: number | null;
  center_lng: number | null;
  radius_meters: number | null;
  color: string;
  is_active: boolean;
}

export interface GeofenceAlertRecord {
  id: string;
  vehicle_name: string | null;
  zone_name: string | null;
  alert_type: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  acknowledged: boolean;
  created_at: string;
}

// Calculate distance between two points using Haversine formula
function calculateDistance(
  lat1: number, lng1: number, 
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideCircle(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radius: number
): boolean {
  return calculateDistance(point.lat, point.lng, center.lat, center.lng) <= radius;
}

interface GeofenceAlertsProps {
  className?: string;
}

export function GeofenceAlerts({ className }: GeofenceAlertsProps) {
  const [showAlerts, setShowAlerts] = useState(true);

  // Fetch zones from DB
  const { data: zones, refetch: refetchZones } = useQuery({
    queryKey: ['geofence-zones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geofence_zones')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as GeofenceZone[];
    },
  });

  // Fetch recent alerts from DB
  const { data: alerts, refetch: refetchAlerts } = useQuery({
    queryKey: ['geofence-alerts-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geofence_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as GeofenceAlertRecord[];
    },
    refetchInterval: 60_000, // Refresh every minute
  });

  const toggleZone = async (zoneId: string, currentActive: boolean) => {
    await supabase
      .from('geofence_zones')
      .update({ is_active: !currentActive })
      .eq('id', zoneId);
    refetchZones();
  };

  const acknowledgeAlert = async (alertId: string) => {
    await supabase
      .from('geofence_alerts')
      .update({ acknowledged: true })
      .eq('id', alertId);
    refetchAlerts();
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit',
    });
  };

  const unacknowledgedCount = alerts?.filter(a => !a.acknowledged).length || 0;

  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Géorepérage
            {unacknowledgedCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {unacknowledgedCount}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowAlerts(!showAlerts)}
          >
            {showAlerts ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 space-y-4">
        {/* Active Zones */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
            Zones surveillées
          </div>
          <div className="space-y-1.5">
            {zones?.map(zone => (
              <div 
                key={zone.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zone.color }} />
                  <span className="text-sm">{zone.name}</span>
                  {zone.radius_meters && (
                    <span className="text-xs text-muted-foreground">
                      ({(zone.radius_meters / 1000).toFixed(1)} km)
                    </span>
                  )}
                </div>
                <Switch
                  checked={zone.is_active}
                  onCheckedChange={() => toggleZone(zone.id, zone.is_active)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Alerts Section */}
        {showAlerts && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
              Alertes récentes
            </div>

            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {!alerts || alerts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucune alerte</p>
                    <p className="text-xs">Les alertes de géorepérage apparaîtront ici automatiquement</p>
                  </div>
                ) : (
                  alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={cn(
                        'p-2.5 rounded-lg border transition-all',
                        alert.alert_type === 'exit' 
                          ? 'border-destructive/50 bg-destructive/5' 
                          : 'border-green-500/50 bg-green-500/5',
                        !alert.acknowledged && 'ring-1 ring-destructive/30'
                      )}
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {alert.alert_type === 'exit' ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          <span className="font-medium text-sm">
                            {alert.alert_type === 'exit' ? 'Sortie de zone' : 'Entrée en zone'}
                          </span>
                        </div>
                        {!alert.acknowledged && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            OK
                          </Button>
                        )}
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Car className="h-3 w-3" />
                          <span className="font-medium text-foreground">
                            {alert.vehicle_name || '—'}
                          </span>
                          {alert.speed != null && alert.speed > 0 && (
                            <span className={cn(
                              'font-mono',
                              alert.speed > 80 ? 'text-destructive' : ''
                            )}>
                              {alert.speed} km/h
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />
                          <span>{alert.zone_name || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(alert.created_at)} {formatTime(alert.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default GeofenceAlerts;
