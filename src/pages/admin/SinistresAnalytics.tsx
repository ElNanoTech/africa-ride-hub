import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminAccidents, useAdminAccidentKPIs } from '@/hooks/useSinistres';
import { ShieldAlert, MapPin, TrendingUp, Calendar, ArrowLeft, AlertTriangle, FolderOpen, UserCheck } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { format, subDays, startOfDay, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';
import 'leaflet/dist/leaflet.css';
import { CaseStatusBadge } from '@/components/sinistres/CaseStatusBadge';
import { SeverityBadge } from '@/components/sinistres/SeverityBadge';

type Window = '7' | '30' | '90' | 'all';

export default function SinistresAnalytics() {
  const navigate = useNavigate();
  const [windowDays, setWindowDays] = useState<Window>('30');
  const { data: kpis } = useAdminAccidentKPIs();
  const { data: rows = [], isLoading } = useAdminAccidents({});

  const filtered = useMemo(() => {
    if (windowDays === 'all') return rows;
    const cutoff = startOfDay(subDays(new Date(), Number(windowDays)));
    return rows.filter((r) => isAfter(new Date(r.accident_datetime), cutoff));
  }, [rows, windowDays]);

  const withCoords = filtered.filter((r) => r.location_lat != null && r.location_lng != null);

  // Hotspots: cluster by 3-decimal lat/lng (~110m precision)
  const hotspots = useMemo(() => {
    const groups = new Map<string, { lat: number; lng: number; count: number; severe: number; city: string | null }>();
    for (const r of withCoords) {
      const key = `${(r.location_lat as number).toFixed(3)},${(r.location_lng as number).toFixed(3)}`;
      const g = groups.get(key) ?? { lat: r.location_lat as number, lng: r.location_lng as number, count: 0, severe: 0, city: r.city };
      g.count += 1;
      if (r.severity === 'SEVERE') g.severe += 1;
      groups.set(key, g);
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [withCoords]);

  // City breakdown
  const byCity = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const c = r.city || 'Inconnu';
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filtered]);

  // Severity breakdown
  const bySeverity = useMemo(() => {
    const m = { MINOR: 0, MODERATE: 0, SEVERE: 0 } as Record<string, number>;
    for (const r of filtered) m[r.severity] = (m[r.severity] ?? 0) + 1;
    return m;
  }, [filtered]);

  // Time of day
  const byHour = useMemo(() => {
    const buckets: Record<string, number> = { 'Nuit (00–06h)': 0, 'Matin (06–12h)': 0, 'Après-midi (12–18h)': 0, 'Soir (18–24h)': 0 };
    for (const r of filtered) {
      const h = new Date(r.accident_datetime).getHours();
      if (h < 6) buckets['Nuit (00–06h)']++;
      else if (h < 12) buckets['Matin (06–12h)']++;
      else if (h < 18) buckets['Après-midi (12–18h)']++;
      else buckets['Soir (18–24h)']++;
    }
    return buckets;
  }, [filtered]);

  // Default map center: Abidjan
  const center: [number, number] = withCoords.length
    ? [withCoords[0].location_lat as number, withCoords[0].location_lng as number]
    : [5.345, -4.024];

  const radiusFor = (count: number) => Math.min(8 + count * 4, 28);
  const colorFor = (severeCount: number, total: number) =>
    severeCount > 0 ? 'hsl(var(--destructive))' : total >= 3 ? 'hsl(var(--warning))' : 'hsl(var(--primary))';

  return (
    <AdminLayout>
      <AdminBreadcrumb
        items={[
          { label: 'Sinistres', href: '/admin/sinistres' },
          { label: 'Analytique' },
        ]}
      />
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/sinistres')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-primary" /> Analytique des sinistres
              </h1>
              <p className="text-sm text-muted-foreground">Hotspots, tendances et répartition</p>
            </div>
          </div>
          <Select value={windowDays} onValueChange={(v) => setWindowDays(v as Window)}>
            <SelectTrigger className="w-[200px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 derniers jours</SelectItem>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
              <SelectItem value="all">Tout l'historique</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<FolderOpen className="h-4 w-4" />} label="Total dans la période" value={filtered.length} />
          <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Graves" value={bySeverity.SEVERE} accent="danger" />
          <KpiCard icon={<MapPin className="h-4 w-4 text-primary" />} label="Hotspots distincts" value={hotspots.length} accent="info" />
          <KpiCard icon={<UserCheck className="h-4 w-4 text-success" />} label="Géolocalisés" value={`${withCoords.length}/${filtered.length}`} />
        </div>

        {/* Map */}
        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Carte des incidents</h2>
              <p className="text-xs text-muted-foreground">Taille = nombre d'incidents. Rouge = au moins 1 grave.</p>
            </div>
            <div className="h-[480px] w-full p-4">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : withCoords.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground bg-muted/20 rounded">
                  Aucun incident géolocalisé sur la période.
                </div>
              ) : (
                <div className="h-full rounded-lg overflow-hidden border">
                  <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                    <TileLayer
                      attribution='&copy; OpenStreetMap'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {hotspots.map((h, i) => (
                      <CircleMarker
                        key={i}
                        center={[h.lat, h.lng]}
                        radius={radiusFor(h.count)}
                        pathOptions={{
                          color: colorFor(h.severe, h.count),
                          fillColor: colorFor(h.severe, h.count),
                          fillOpacity: 0.4,
                          weight: 2,
                        }}
                      >
                        <Popup>
                          <div className="text-xs">
                            <div className="font-semibold">{h.city ?? 'Lieu non identifié'}</div>
                            <div>{h.count} incident{h.count > 1 ? 's' : ''}</div>
                            {h.severe > 0 && <div className="text-destructive">{h.severe} grave(s)</div>}
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Two-column charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold">Top zones</h3>
              {byCity.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aucune donnée.</p>
              ) : (
                <div className="space-y-2">
                  {byCity.map(([city, n]) => {
                    const pct = (n / filtered.length) * 100;
                    return (
                      <div key={city}>
                        <div className="flex items-center justify-between text-sm">
                          <span>{city}</span>
                          <span className="font-medium">{n}</span>
                        </div>
                        <div className="h-2 bg-muted rounded overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold">Répartition</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Par gravité</div>
                  <div className="flex gap-2 text-xs">
                    <Stat label="Mineur" value={bySeverity.MINOR} color="bg-muted-foreground" />
                    <Stat label="Modéré" value={bySeverity.MODERATE} color="bg-warning" />
                    <Stat label="Grave" value={bySeverity.SEVERE} color="bg-destructive" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Par tranche horaire</div>
                  <div className="space-y-1">
                    {Object.entries(byHour).map(([label, n]) => {
                      const pct = filtered.length ? (n / filtered.length) * 100 : 0;
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-xs">
                            <span>{label}</span>
                            <span className="font-medium">{n}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent severe list */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Incidents graves récents
            </h3>
            {filtered.filter((r) => r.severity === 'SEVERE').length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucun incident grave dans la période.</p>
            ) : (
              <div className="divide-y">
                {filtered.filter((r) => r.severity === 'SEVERE').slice(0, 8).map((r) => (
                  <div
                    key={r.id}
                    className="py-2 flex items-center justify-between gap-3 cursor-pointer hover:bg-muted/30 px-2 rounded"
                    onClick={() => navigate(`/admin/sinistres/${r.id}`)}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs">{r.case_number ?? '—'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.driver?.full_name} • {r.city ?? '—'} • {format(new Date(r.accident_datetime), 'dd MMM HH:mm', { locale: fr })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <SeverityBadge severity={r.severity} />
                      <CaseStatusBadge status={r.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function KpiCard({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number | string; accent?: 'danger' | 'info' }) {
  const cls = accent === 'danger' ? 'border-destructive/30' : accent === 'info' ? 'border-primary/30' : '';
  return (
    <Card className={cls}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 text-center p-2 rounded border">
      <div className={`h-1 w-full rounded mb-1 ${color}`} />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
