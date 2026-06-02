import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { format, subDays, addMinutes, differenceInMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Play, Pause, SkipBack, SkipForward, CalendarIcon, 
  Clock, Navigation, MapPin, Route, Car, Bike,
  FastForward, TrendingUp, Fuel
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface TripPoint {
  lat: number;
  lng: number;
  timestamp: Date;
  speed: number;
  heading: number;
}

interface TripData {
  id: string;
  vehicleId: string;
  driverName: string;
  vehicleModel: string;
  vehicleType: 'car' | 'bike';
  licensePlate: string;
  startTime: Date;
  endTime: Date;
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  points: TripPoint[];
}

interface DriverOption {
  id: string;
  name: string;
  vehicleType: 'car' | 'bike';
  licensePlate: string;
}

// Mock driver data
const DRIVERS: DriverOption[] = [
  { id: 'v1', name: 'Koné Aminata', vehicleType: 'car', licensePlate: 'AB-1234-CI' },
  { id: 'v2', name: 'Diallo Mamadou', vehicleType: 'car', licensePlate: 'CD-5678-CI' },
  { id: 'v3', name: 'Touré Ibrahim', vehicleType: 'car', licensePlate: 'EF-9012-CI' },
  { id: 'v4', name: 'Ouattara Sekou', vehicleType: 'bike', licensePlate: 'GH-3456-CI' },
];

// Abidjan route waypoints for realistic simulation
const ABIDJAN_ROUTES = {
  cocody_plateau: [
    { lat: 5.3467, lng: -3.9833 }, // Cocody
    { lat: 5.3400, lng: -3.9900 },
    { lat: 5.3333, lng: -3.9950 },
    { lat: 5.3280, lng: -4.0000 },
    { lat: 5.3200, lng: -4.0083 }, // Plateau
  ],
  yopougon_adjame: [
    { lat: 5.3500, lng: -4.0800 }, // Yopougon
    { lat: 5.3550, lng: -4.0600 },
    { lat: 5.3600, lng: -4.0400 },
    { lat: 5.3650, lng: -4.0200 },
    { lat: 5.3700, lng: -4.0000 }, // Adjamé
  ],
  marcory_treichville: [
    { lat: 5.3100, lng: -3.9900 }, // Marcory
    { lat: 5.3050, lng: -3.9950 },
    { lat: 5.3000, lng: -4.0000 },
    { lat: 5.2950, lng: -4.0050 },
    { lat: 5.2900, lng: -4.0100 }, // Treichville
  ],
};

// Generate simulated trip history
const generateTripHistory = (vehicleId: string, date: Date): TripData[] => {
  const driver = DRIVERS.find(d => d.id === vehicleId);
  if (!driver) return [];

  const routes = Object.values(ABIDJAN_ROUTES);
  const trips: TripData[] = [];
  
  // Generate 3-5 trips for the day
  const tripCount = 3 + Math.floor(Math.random() * 3);
  let currentTime = new Date(date);
  currentTime.setHours(6, 0, 0, 0); // Start at 6 AM

  for (let i = 0; i < tripCount; i++) {
    // Add break between trips
    currentTime = addMinutes(currentTime, 30 + Math.random() * 60);
    
    const route = routes[i % routes.length];
    const tripDuration = 20 + Math.random() * 40; // 20-60 minutes
    const pointCount = Math.floor(tripDuration * 2); // Point every ~30 seconds
    
    const points: TripPoint[] = [];
    const startTime = new Date(currentTime);
    
    for (let j = 0; j < pointCount; j++) {
      const progress = j / (pointCount - 1);
      const routeIndex = Math.min(Math.floor(progress * (route.length - 1)), route.length - 2);
      const localProgress = (progress * (route.length - 1)) % 1;
      
      const startPoint = route[routeIndex];
      const endPoint = route[routeIndex + 1];
      
      // Add some randomness to make it look natural
      const jitter = 0.0003;
      const lat = startPoint.lat + (endPoint.lat - startPoint.lat) * localProgress + (Math.random() - 0.5) * jitter;
      const lng = startPoint.lng + (endPoint.lng - startPoint.lng) * localProgress + (Math.random() - 0.5) * jitter;
      
      const timestamp = addMinutes(startTime, (tripDuration / pointCount) * j);
      const speed = j === 0 || j === pointCount - 1 ? 0 : 20 + Math.random() * 40;
      
      points.push({
        lat,
        lng,
        timestamp,
        speed: Math.round(speed),
        heading: Math.atan2(endPoint.lng - startPoint.lng, endPoint.lat - startPoint.lat) * (180 / Math.PI),
      });
    }
    
    const endTime = points[points.length - 1].timestamp;
    currentTime = endTime;
    
    // Calculate trip stats
    const speeds = points.map(p => p.speed).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = Math.max(...speeds, 0);
    
    // Approximate distance
    let distance = 0;
    for (let k = 1; k < points.length; k++) {
      const dx = (points[k].lng - points[k-1].lng) * 111 * Math.cos(points[k].lat * Math.PI / 180);
      const dy = (points[k].lat - points[k-1].lat) * 111;
      distance += Math.sqrt(dx * dx + dy * dy);
    }
    
    trips.push({
      id: `trip-${vehicleId}-${i}`,
      vehicleId,
      driverName: driver.name,
      vehicleModel: vehicleId === 'v1' ? 'Toyota Corolla' : 
                    vehicleId === 'v2' ? 'Honda Fit' : 
                    vehicleId === 'v3' ? 'Suzuki Swift' : 'Yamaha YBR',
      vehicleType: driver.vehicleType,
      licensePlate: driver.licensePlate,
      startTime,
      endTime,
      distance: Math.round(distance * 10) / 10,
      avgSpeed: Math.round(avgSpeed),
      maxSpeed: Math.round(maxSpeed),
      points,
    });
  }
  
  return trips;
};

// Vehicle marker for replay
const createReplayMarker = (type: 'car' | 'bike', heading: number) => {
  const size = type === 'car' ? 40 : 34;
  
  return L.divIcon({
    className: 'replay-vehicle-marker',
    html: `
      <div style="
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
        transform: rotate(${heading}deg);
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="${size - 16}" height="${size - 16}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${type === 'car' 
            ? '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>'
            : '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>'
          }
        </svg>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Start/End markers
const createPointMarker = (type: 'start' | 'end') => {
  const color = type === 'start' ? '#22c55e' : '#ef4444';
  const icon = type === 'start' ? 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' : 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
  
  return L.divIcon({
    className: 'point-marker',
    html: `
      <div style="
        background: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      ">
        <span style="color: white; font-size: 10px; font-weight: bold;">
          ${type === 'start' ? 'A' : 'B'}
        </span>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Map bounds updater
function MapBoundsUpdater({ points }: { points: TripPoint[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [points, map]);
  
  return null;
}

interface TripHistoryReplayProps {
  height?: string;
  className?: string;
}

export function TripHistoryReplay({ height = '500px', className }: TripHistoryReplayProps) {
  const [selectedDriver, setSelectedDriver] = useState<string>(DRIVERS[0].id);
  const [selectedDate, setSelectedDate] = useState<Date>(subDays(new Date(), 1));
  const [trips, setTrips] = useState<TripData[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Load trips when driver or date changes
  useEffect(() => {
    const newTrips = generateTripHistory(selectedDriver, selectedDate);
    setTrips(newTrips);
    setSelectedTrip(newTrips[0] || null);
    setPlaybackPosition(0);
    setIsPlaying(false);
  }, [selectedDriver, selectedDate]);
  
  // Playback logic
  useEffect(() => {
    if (isPlaying && selectedTrip) {
      playbackRef.current = setInterval(() => {
        setPlaybackPosition(prev => {
          const next = prev + 1;
          if (next >= selectedTrip.points.length) {
            setIsPlaying(false);
            return selectedTrip.points.length - 1;
          }
          return next;
        });
      }, 200 / playbackSpeed);
    }
    
    return () => {
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, [isPlaying, selectedTrip, playbackSpeed]);
  
  const handlePlayPause = useCallback(() => {
    if (selectedTrip && playbackPosition >= selectedTrip.points.length - 1) {
      setPlaybackPosition(0);
    }
    setIsPlaying(prev => !prev);
  }, [selectedTrip, playbackPosition]);
  
  const handleSkipStart = () => {
    setPlaybackPosition(0);
    setIsPlaying(false);
  };
  
  const handleSkipEnd = () => {
    if (selectedTrip) {
      setPlaybackPosition(selectedTrip.points.length - 1);
      setIsPlaying(false);
    }
  };
  
  const currentPoint = selectedTrip?.points[playbackPosition];
  const routeUpToPosition = selectedTrip?.points.slice(0, playbackPosition + 1) || [];
  const remainingRoute = selectedTrip?.points.slice(playbackPosition) || [];
  
  const driver = DRIVERS.find(d => d.id === selectedDriver);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Route className="h-5 w-5 text-primary" />
            Historique des Trajets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sélectionner un chauffeur" />
              </SelectTrigger>
              <SelectContent>
                {DRIVERS.map(d => (
                  <SelectItem key={d.id} value={d.id}>
                    <div className="flex items-center gap-2">
                      {d.vehicleType === 'car' ? <Car className="h-4 w-4" /> : <Bike className="h-4 w-4" />}
                      {d.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, 'dd MMM yyyy', { locale: fr })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          
          {/* Trip selector */}
          {trips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {trips.map((trip, idx) => (
                <Button
                  key={trip.id}
                  variant={selectedTrip?.id === trip.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedTrip(trip);
                    setPlaybackPosition(0);
                    setIsPlaying(false);
                  }}
                  className="gap-2"
                >
                  <span>Trajet {idx + 1}</span>
                  <span className="text-xs opacity-70">
                    {format(trip.startTime, 'HH:mm')} - {format(trip.endTime, 'HH:mm')}
                  </span>
                </Button>
              ))}
            </div>
          )}
          
          {trips.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucun trajet trouvé pour cette date</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Map and playback */}
      {selectedTrip && (
        <>
          <div className="relative rounded-xl overflow-hidden border" style={{ height }}>
            <MapContainer
              center={[selectedTrip.points[0].lat, selectedTrip.points[0].lng]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              <MapBoundsUpdater points={selectedTrip.points} />
              
              {/* Remaining route (gray) */}
              {remainingRoute.length > 1 && (
                <Polyline
                  positions={remainingRoute.map(p => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: '#9ca3af', weight: 4, opacity: 0.5, dashArray: '10, 10' }}
                />
              )}
              
              {/* Traveled route (blue) */}
              {routeUpToPosition.length > 1 && (
                <Polyline
                  positions={routeUpToPosition.map(p => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.9 }}
                />
              )}
              
              {/* Start marker */}
              <Marker
                position={[selectedTrip.points[0].lat, selectedTrip.points[0].lng]}
                icon={createPointMarker('start')}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>Départ</strong>
                    <br />
                    {format(selectedTrip.startTime, 'HH:mm', { locale: fr })}
                  </div>
                </Popup>
              </Marker>
              
              {/* End marker */}
              <Marker
                position={[selectedTrip.points[selectedTrip.points.length - 1].lat, selectedTrip.points[selectedTrip.points.length - 1].lng]}
                icon={createPointMarker('end')}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>Arrivée</strong>
                    <br />
                    {format(selectedTrip.endTime, 'HH:mm', { locale: fr })}
                  </div>
                </Popup>
              </Marker>
              
              {/* Current vehicle position */}
              {currentPoint && (
                <Marker
                  position={[currentPoint.lat, currentPoint.lng]}
                  icon={createReplayMarker(selectedTrip.vehicleType, currentPoint.heading)}
                >
                  <Popup>
                    <div className="text-sm space-y-1">
                      <strong>{selectedTrip.driverName}</strong>
                      <br />
                      <span className="text-muted-foreground">{selectedTrip.licensePlate}</span>
                      <br />
                      <span>{currentPoint.speed} km/h</span>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
            
            {/* Speed info overlay */}
            <div className="absolute top-4 right-4 z-[1000]">
              <Card className="bg-background/95 backdrop-blur-sm">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Navigation className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{currentPoint?.speed || 0} km/h</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{currentPoint ? format(currentPoint.timestamp, 'HH:mm:ss') : '--:--:--'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          {/* Playback controls */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Progress slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{format(selectedTrip.startTime, 'HH:mm')}</span>
                    <span>{currentPoint ? format(currentPoint.timestamp, 'HH:mm:ss') : '--:--'}</span>
                    <span>{format(selectedTrip.endTime, 'HH:mm')}</span>
                  </div>
                  <Slider
                    value={[playbackPosition]}
                    onValueChange={([val]) => {
                      setPlaybackPosition(val);
                      setIsPlaying(false);
                    }}
                    max={selectedTrip.points.length - 1}
                    step={1}
                    className="cursor-pointer"
                  />
                </div>
                
                {/* Controls */}
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" size="icon" onClick={handleSkipStart}>
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button size="icon" onClick={handlePlayPause} className="h-12 w-12">
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleSkipEnd}>
                    <SkipForward className="h-4 w-4" />
                  </Button>
                  
                  <div className="w-px h-8 bg-border mx-2" />
                  
                  <Select value={playbackSpeed.toString()} onValueChange={(v) => setPlaybackSpeed(Number(v))}>
                    <SelectTrigger className="w-[100px]">
                      <FastForward className="h-4 w-4 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.5">0.5x</SelectItem>
                      <SelectItem value="1">1x</SelectItem>
                      <SelectItem value="2">2x</SelectItem>
                      <SelectItem value="4">4x</SelectItem>
                      <SelectItem value="8">8x</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Trip stats */}
                <div className="grid grid-cols-4 gap-4 pt-2 border-t">
                  <div className="text-center">
                    <p className="text-lg font-bold">{selectedTrip.distance} km</p>
                    <p className="text-xs text-muted-foreground">Distance</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{differenceInMinutes(selectedTrip.endTime, selectedTrip.startTime)} min</p>
                    <p className="text-xs text-muted-foreground">Durée</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{selectedTrip.avgSpeed} km/h</p>
                    <p className="text-xs text-muted-foreground">Vitesse moy.</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{selectedTrip.maxSpeed} km/h</p>
                    <p className="text-xs text-muted-foreground">Vitesse max</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default TripHistoryReplay;
