import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons for bundlers (Vite)
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 16, { animate: true });
  }, [lat, lng, map]);
  return null;
}

interface Props {
  lat: number | null;
  lng: number | null;
  height?: number | string;
  className?: string;
}

export function AccidentMap({ lat, lng, height = 220, className }: Props) {
  if (lat == null || lng == null) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded-lg text-xs text-muted-foreground ${className ?? ''}`}
        style={{ height }}
      >
        Aucune localisation
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border border-border ${className ?? ''}`} style={{ height }}>
      <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} />
        <Recenter lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}
