import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';

export interface VehicleGpsPosition {
  lat: number;
  lng: number;
  vehicle_no: string;
  last_update: string | null;
  synced_at: string | null;
  ageMs: number; // age in ms relative to "now" at fetch time
}

/**
 * Look up the latest Uffizio GPS position for a vehicle by:
 *  1. Trying exact match on uffizio_imei → vehicle_positions.imei_no
 *  2. Falling back to fuzzy match on license_plate (strip trailing "-NN" suffix)
 *     vs vehicle_positions.vehicle_no (which often contains "MODEL AA-XXX-YY").
 *
 * Returns null when no match is found. Stale positions are still returned —
 * callers decide what to do based on `ageMs`.
 */
export function useVehicleGpsPosition(vehicleId: string | null | undefined) {
  const [position, setPosition] = useState<VehicleGpsPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosition = useCallback(async () => {
    if (!vehicleId) {
      setPosition(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Get vehicle metadata
      const { data: veh, error: vehErr } = await supabase
        .from('vehicles')
        .select('id, license_plate, uffizio_imei')
        .eq('id', vehicleId)
        .maybeSingle();
      if (vehErr) throw new Error(vehErr.message);
      if (!veh) {
        setPosition(null);
        return;
      }

      // 2. Try exact IMEI match
      let row: any = null;
      if (veh.uffizio_imei) {
        const { data } = await supabase
          .from('vehicle_positions')
          .select('lat, lng, vehicle_no, last_update, synced_at, imei_no')
          .eq('imei_no', veh.uffizio_imei)
          .maybeSingle();
        if (data) row = data;
      }

      // 3. Fuzzy match by license plate (strip trailing -NN suffix)
      if (!row && veh.license_plate) {
        const stripped = veh.license_plate.replace(/-\d+$/, '').trim();
        if (stripped.length >= 4) {
          const { data } = await supabase
            .from('vehicle_positions')
            .select('lat, lng, vehicle_no, last_update, synced_at')
            .ilike('vehicle_no', `%${stripped}%`)
            .order('synced_at', { ascending: false })
            .limit(1);
          if (data && data.length > 0) row = data[0];
        }
      }

      if (!row || row.lat == null || row.lng == null) {
        setPosition(null);
        return;
      }

      const syncedTs = row.synced_at ? new Date(row.synced_at).getTime() : 0;
      const ageMs = syncedTs > 0 ? Date.now() - syncedTs : Number.POSITIVE_INFINITY;
      setPosition({
        lat: Number(row.lat),
        lng: Number(row.lng),
        vehicle_no: row.vehicle_no ?? '',
        last_update: row.last_update ?? null,
        synced_at: row.synced_at ?? null,
        ageMs,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de récupération de la position');
      setPosition(null);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  return { position, loading, error, refresh: fetchPosition };
}

export function formatPositionAge(ageMs: number): string {
  if (!isFinite(ageMs)) return 'inconnu';
  const min = Math.floor(ageMs / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}
