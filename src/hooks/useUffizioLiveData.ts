import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';

export interface UffizioVehicle {
  id: string;
  vehicle_no: string;
  imei_no: string;
  lat: number;
  lng: number;
  speed: number;
  status: 'moving' | 'idle' | 'offline';
  heading?: number;
  last_update: string;
  device_name: string;
  driver_name: string;
  ignition: string;
  company: string;
  fuel_level?: number;
  synced_at?: string;
}

type ConnectionStatus = 'live' | 'delayed' | 'offline';

interface UseUffizioLiveDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // in ms, minimum 180000 (3 min) for API calls
}

export function useUffizioLiveData(options: UseUffizioLiveDataOptions = {}) {
  const { autoRefresh = true, refreshInterval = 300000 } = options; // 5 min default for API sync
  const [vehicles, setVehicles] = useState<UffizioVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [method, setMethod] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('live');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mapDbRow = (row: any): UffizioVehicle => ({
    id: row.id || row.imei_no || row.vehicle_no,
    vehicle_no: row.vehicle_no || '',
    imei_no: row.imei_no || '',
    lat: row.lat || 0,
    lng: row.lng || 0,
    speed: typeof row.speed === 'string' ? parseFloat(row.speed) : (row.speed || 0),
    status: (row.status as 'moving' | 'idle' | 'offline') || 'offline',
    heading: row.heading,
    last_update: row.last_update || '',
    device_name: row.device_name || '',
    driver_name: row.driver_name || '',
    ignition: row.ignition || '',
    company: row.company || '',
    fuel_level: row.fuel_level,
    synced_at: row.synced_at,
  });

  // Load initial data from vehicle_positions table (fast, no API call)
  const loadFromDb = useCallback(async () => {
    try {
      const { data, error: dbError } = await supabase
        .from('vehicle_positions')
        .select('*')
        .order('vehicle_no');

      if (dbError) throw new Error(dbError.message);

      if (data && data.length > 0) {
        const mapped = data.map(mapDbRow);
        setVehicles(mapped);
        setLastRefresh(new Date());
        setError(null);

        // Check freshness
        const latestSync = data.reduce((latest, row) => {
          const t = new Date(row.synced_at).getTime();
          return t > latest ? t : latest;
        }, 0);
        const ageMs = Date.now() - latestSync;
        if (ageMs < 300000) setConnectionStatus('live');        // < 5 min
        else if (ageMs < 900000) setConnectionStatus('delayed'); // < 15 min
        else setConnectionStatus('offline');
      }
      setLoading(false);
    } catch (err: any) {
      console.error('DB load error:', err);
      // Fall through - will try API sync
      setLoading(false);
    }
  }, []);

  // Trigger backend sync (calls Uffizio API → upserts into vehicle_positions → Realtime pushes)
  const triggerSync = useCallback(async () => {
    try {
      setError(null);
      const { data, error: fnError } = await supabase.functions.invoke('sync-uffizio', {
        body: { action: 'getLiveData' },
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) {
        // Retry once
        if (data?.count === 0 || !data?.vehicles?.length) {
          console.log('Uffizio sync: 0 vehicles, retrying in 2s...');
          await new Promise(r => setTimeout(r, 2000));
          const { data: retryData, error: retryError } = await supabase.functions.invoke('sync-uffizio', {
            body: { action: 'getLiveData' },
          });
          if (retryError) throw new Error(retryError.message);
          if (!retryData?.success) throw new Error(retryData?.error || 'Échec de synchronisation');
          setMethod(retryData.method || '');
          // Data will arrive via Realtime subscription
          return;
        }
        throw new Error(data?.error || 'Échec de synchronisation');
      }
      setMethod(data.method || '');
      // Data will arrive via Realtime subscription, but also set directly for first load
      setConnectionStatus('live');
      setLastRefresh(new Date());
    } catch (err: any) {
      const msg = err?.message || '';
      // Uffizio rate-limit ("Please wait for 3 minutes") is expected; don't surface as error.
      if (/3 minutes|rate limit|throttle/i.test(msg)) {
        console.log('Uffizio sync skipped (rate-limited), using cached data');
        return;
      }
      console.error('Uffizio sync error:', err);
      setError(err.message);
    }
  }, []);

  // Combined refresh: trigger API sync
  const refresh = useCallback(async () => {
    setLoading(true);
    await triggerSync();
    // Reload from DB to get latest after sync
    await loadFromDb();
  }, [triggerSync, loadFromDb]);

  // Subscribe to Realtime changes on vehicle_positions
  useEffect(() => {
    // Initial load from DB (instant, no API wait)
    loadFromDb().then(async () => {
      // Only trigger a background sync if cached data is stale (>3 min, the Uffizio rate-limit window).
      // Otherwise we'd just hit "Please wait for 3 minutes" and surface a false connection error.
      try {
        const { data } = await supabase
          .from('vehicle_positions')
          .select('synced_at')
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const latest = data?.synced_at ? new Date(data.synced_at).getTime() : 0;
        const ageMs = Date.now() - latest;
        if (ageMs > 180000) {
          triggerSync();
        }
      } catch {
        // If we can't check, fall back to triggering sync
        triggerSync();
      }
    });

    // Realtime subscription - updates arrive instantly when sync-uffizio upserts
    const channel = supabase
      .channel('vehicle-positions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicle_positions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const updated = mapDbRow(payload.new);
            setVehicles(prev => {
              const idx = prev.findIndex(v => v.imei_no === updated.imei_no);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = updated;
                return next;
              }
              return [...prev, updated];
            });
            setLastRefresh(new Date());
            setConnectionStatus('live');
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setVehicles(prev => prev.filter(v => v.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    // Periodic API sync (triggers backend to fetch from Uffizio and upsert)
    if (autoRefresh) {
      const interval = Math.max(refreshInterval, 180000); // enforce 3 min minimum
      intervalRef.current = setInterval(triggerSync, interval);
    }

    // Update connection status periodically
    const statusInterval = setInterval(() => {
      setVehicles(prev => {
        if (prev.length === 0) return prev;
        const latestSync = prev.reduce((latest, v) => {
          const t = v.synced_at ? new Date(v.synced_at).getTime() : 0;
          return t > latest ? t : latest;
        }, 0);
        const ageMs = Date.now() - latestSync;
        if (ageMs < 300000) setConnectionStatus('live');
        else if (ageMs < 900000) setConnectionStatus('delayed');
        else setConnectionStatus('offline');
        return prev; // no state change
      });
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(statusInterval);
    };
  }, [loadFromDb, triggerSync, autoRefresh, refreshInterval]);

  return {
    vehicles,
    loading,
    error,
    lastRefresh,
    method,
    connectionStatus,
    refresh,
    stats: {
      total: vehicles.length,
      moving: vehicles.filter(v => v.status === 'moving').length,
      idle: vehicles.filter(v => v.status === 'idle').length,
      offline: vehicles.filter(v => v.status === 'offline').length,
    },
  };
}
