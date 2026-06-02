import { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Car, Navigation, Clock, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQuery } from '@tanstack/react-query';
import type { UffizioVehicle } from '@/hooks/useUffizioLiveData';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Cache icons to avoid re-creating on every render
const iconCache: Record<string, L.DivIcon> = {};
const createVehicleIcon = (status: 'moving' | 'idle' | 'offline') => {
  if (iconCache[status]) return iconCache[status];
  const colors = { moving: '#22c55e', idle: '#f59e0b', offline: '#ef4444' };
  const color = colors[status];
  
  const icon = L.divIcon({
    className: 'custom-vehicle-marker',
    html: `
      <div style="
        background: ${color};
        width: 32px; height: 32px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ${status === 'moving' ? 'animation: pulse 2s infinite;' : ''}
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
  iconCache[status] = icon;
  return icon;
};

// Custom cluster icon
const createClusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const markers = cluster.getAllChildMarkers();
  
  // Count statuses in this cluster
  let moving = 0, idle = 0, offline = 0;
  markers.forEach((m: any) => {
    const status = m.options?.vehicleStatus;
    if (status === 'moving') moving++;
    else if (status === 'idle') idle++;
    else offline++;
  });
  
  const dominant = moving >= idle && moving >= offline ? '#22c55e' : idle >= offline ? '#f59e0b' : '#ef4444';
  const size = count < 10 ? 40 : count < 30 ? 50 : 60;
  
  return L.divIcon({
    html: `
      <div style="
        background: ${dominant};
        width: ${size}px; height: ${size}px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        border: 3px solid white;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        color: white;
        font-weight: bold;
        font-size: ${count < 10 ? 14 : 16}px;
      ">${count}</div>
    `,
    className: 'custom-cluster-marker',
    iconSize: L.point(size, size),
    iconAnchor: [size / 2, size / 2],
  });
};

const ABIDJAN_CENTER = { lat: 5.3600, lng: -4.0083 };

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [center, zoom, map]);
  return null;
}

interface VehicleTrackingMapProps {
  className?: string;
  vehicles: UffizioVehicle[];
  selectedVehicleId?: string;
  onVehicleSelect?: (vehicle: UffizioVehicle) => void;
  showLegend?: boolean;
  showGeofences?: boolean;
  activeGeofenceIds?: string[];
  height?: string;
}

export function VehicleTrackingMap({ 
  className, 
  vehicles,
  selectedVehicleId, 
  onVehicleSelect,
  showLegend = true,
  showGeofences = false,
  activeGeofenceIds,
  height = '500px',
}: VehicleTrackingMapProps) {
  const [showZones, setShowZones] = useState(showGeofences);

  const { data: dbZones } = useQuery({
    queryKey: ['geofence-zones-map'],
    queryFn: async () => {
      const { data } = await supabase.from('geofence_zones').select('*').eq('is_active', true);
      return data || [];
    },
  });

  const activeGeofences = (dbZones || []).filter(
    zone => activeGeofenceIds ? activeGeofenceIds.includes(zone.id) : true
  );

  // Filter vehicles with valid coordinates
  const validVehicles = useMemo(
    () => vehicles.filter(v => v.lat !== 0 && v.lng !== 0),
    [vehicles]
  );

  const statusCounts = useMemo(() => ({
    moving: validVehicles.filter(v => v.status === 'moving').length,
    idle: validVehicles.filter(v => v.status === 'idle').length,
    offline: validVehicles.filter(v => v.status === 'offline').length,
  }), [validVehicles]);

  const formatTime = useCallback((dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const diff = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diff < 60) return 'À l\'instant';
      if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
      if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
      return `Il y a ${Math.floor(diff / 86400)} j`;
    } catch {
      return dateStr;
    }
  }, []);

  const getFreshnessColor = useCallback((dateStr: string) => {
    if (!dateStr) return 'text-red-500';
    try {
      const age = Date.now() - new Date(dateStr).getTime();
      if (age < 300000) return 'text-green-600'; // < 5 min
      if (age < 900000) return 'text-amber-600'; // < 15 min
      return 'text-red-500';
    } catch {
      return 'text-muted-foreground';
    }
  }, []);

  return (
    <div className={cn('relative rounded-xl overflow-hidden border', className)}>
      <div style={{ height }}>
        <MapContainer
          center={[ABIDJAN_CENTER.lat, ABIDJAN_CENTER.lng]}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Geofence zones */}
          {showZones && activeGeofences.map(zone => (
            zone.zone_type === 'circle' && zone.center_lat && zone.center_lng && zone.radius_meters && (
              <Circle
                key={zone.id}
                center={[zone.center_lat, zone.center_lng]}
                radius={zone.radius_meters}
                pathOptions={{
                  color: zone.color,
                  fillColor: zone.color,
                  fillOpacity: 0.1,
                  weight: 2,
                  dashArray: '5, 5',
                }}
              >
                <Popup>
                  <div className="p-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-4 w-4" style={{ color: zone.color }} />
                      <span className="font-semibold text-sm">{zone.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Rayon: {(zone.radius_meters / 1000).toFixed(1)} km
                    </p>
                  </div>
                </Popup>
              </Circle>
            )
          ))}
          
          {/* Clustered vehicle markers */}
          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={createClusterIcon}
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            disableClusteringAtZoom={15}
          >
            {validVehicles.map(vehicle => (
              <Marker
                key={vehicle.imei_no || vehicle.id}
                position={[vehicle.lat, vehicle.lng]}
                icon={createVehicleIcon(vehicle.status)}
                eventHandlers={{
                  click: () => onVehicleSelect?.(vehicle),
                }}
              >
                <Popup>
                  <div className="min-w-[220px] p-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm truncate max-w-[160px]">{vehicle.vehicle_no}</span>
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-xs font-medium',
                          vehicle.status === 'moving' && 'bg-green-100 text-green-700',
                          vehicle.status === 'idle' && 'bg-amber-100 text-amber-700',
                          vehicle.status === 'offline' && 'bg-red-100 text-red-700'
                        )}
                      >
                        {vehicle.status === 'moving' ? 'En mouvement' : 
                         vehicle.status === 'idle' ? 'À l\'arrêt' : 'Hors ligne'}
                      </span>
                    </div>
                    
                    <div className="space-y-1.5 text-xs text-gray-600">
                      {vehicle.driver_name && (
                        <div className="flex items-center gap-2">
                          <Car className="h-3.5 w-3.5" />
                          <span>{vehicle.driver_name}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <Navigation className="h-3.5 w-3.5" />
                        <span>{vehicle.speed} km/h</span>
                      </div>
                      
                      <div className={cn('flex items-center gap-2', getFreshnessColor(vehicle.synced_at || vehicle.last_update))}>
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatTime(vehicle.synced_at || vehicle.last_update)}</span>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute bottom-4 left-4 z-[1000]">
          <Card className="bg-background/95 backdrop-blur-sm shadow-lg">
            <CardContent className="p-3">
              <div className="text-xs font-semibold mb-2">Flotte GPS — {validVehicles.length} véhicules</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>En mouvement ({statusCounts.moving})</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>À l'arrêt ({statusCounts.idle})</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Hors ligne ({statusCounts.offline})</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Live indicator */}
      <div className="absolute top-4 right-4 z-[1000]">
        <Badge variant="outline" className="bg-background/95 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full mr-2 bg-green-500 animate-pulse" />
          Données live GPS
        </Badge>
      </div>
    </div>
  );
}

export default VehicleTrackingMap;
