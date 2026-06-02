import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/routeClient';
import { Link2, ArrowRight, AlertTriangle, MapPin, Wifi } from 'lucide-react';

interface CoverageData {
  total: number;
  mapped: number;
  unmapped: number;
  topUnmatched: Array<{ vehicle_no: string; last_seen: string | null }>;
}

async function fetchGpsMappingCoverage(): Promise<CoverageData> {
  // Pull recent positions (capped) and the vehicles that own a Uffizio device id.
  const [{ data: positions }, { data: vehicles }] = await Promise.all([
    supabase
      .from('vehicle_positions')
      .select('vehicle_no, customer_id, synced_at')
      .order('synced_at', { ascending: false })
      .limit(1000),
    supabase
      .from('vehicles')
      .select('uffizio_device_id')
      .not('uffizio_device_id', 'is', null),
  ]);

  const mappedSet = new Set((vehicles || []).map((v) => v.uffizio_device_id as string));
  const seen = new Map<string, { last: string | null; mapped: boolean }>();
  for (const p of positions || []) {
    if (!p.vehicle_no) continue;
    const prev = seen.get(p.vehicle_no);
    if (prev) continue;
    seen.set(p.vehicle_no, { last: p.synced_at, mapped: mappedSet.has(p.vehicle_no) });
  }

  const total = seen.size;
  let mapped = 0;
  const unmatched: Array<{ vehicle_no: string; last_seen: string | null }> = [];
  for (const [vehicle_no, info] of seen) {
    if (info.mapped) mapped++;
    else unmatched.push({ vehicle_no, last_seen: info.last });
  }
  unmatched.sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''));

  return {
    total,
    mapped,
    unmapped: unmatched.length,
    topUnmatched: unmatched.slice(0, 5),
  };
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function GpsMappingCoverageCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['gps-mapping-coverage'],
    queryFn: fetchGpsMappingCoverage,
    staleTime: 30_000,
    // No polling — realtime subscriptions below trigger refetches on actual changes.
  });

  // Realtime: invalidate on any change to vehicle_positions or vehicles (mapping links).
  // Debounced so a burst of GPS upserts collapses into a single refetch.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scheduleInvalidate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['gps-mapping-coverage'] });
      }, 1500);
    };

    const channel = supabase
      .channel('gps-coverage-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_positions' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, scheduleInvalidate)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const total = data?.total ?? 0;
  const mapped = data?.mapped ?? 0;
  const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2 sm:pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <CardTitle className="text-sm sm:text-base">Couverture GPS ↔ Véhicules</CardTitle>
          <Badge variant="outline" className="hidden sm:inline-flex items-center gap-1 text-[10px] font-normal">
            <Wifi className="h-3 w-3 text-success animate-pulse" /> Live
          </Badge>
        </div>
        <Link to="/admin/gps-mapping">
          <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
            Gérer <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : (
          <>
            <div>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {mapped}<span className="text-muted-foreground text-base font-normal"> / {total}</span>
                  </p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">Appareils GPS associés à un véhicule</p>
                </div>
                <Badge variant={pct >= 90 ? 'approved' : pct >= 60 ? 'pending' : 'destructive'}>
                  {pct}%
                </Badge>
              </div>
              <Progress value={pct} className="h-2" />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <p className="text-xs sm:text-sm font-medium">
                  Top non associés
                  <span className="text-muted-foreground font-normal"> ({data?.unmapped ?? 0})</span>
                </p>
              </div>
              {data && data.topUnmatched.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.topUnmatched.map((row) => (
                    <li
                      key={row.vehicle_no}
                      className="flex items-center justify-between gap-2 text-xs sm:text-sm rounded-md bg-muted/40 px-2.5 py-1.5"
                    >
                      <span className="font-mono truncate">{row.vehicle_no}</span>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">
                        {formatRelative(row.last_seen)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground py-2 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" /> Tous les appareils GPS sont associés.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default GpsMappingCoverageCard;
