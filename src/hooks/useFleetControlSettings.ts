import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import {
  DEFAULT_FLEET_CONTROL_SETTINGS,
  type FleetControlSettings,
} from '@/lib/fleetControl';

export const FLEET_CONTROL_SETTINGS_QUERY_KEY = ['fleet-control-settings'] as const;

function parseFleetControlSettings(data: any): FleetControlSettings {
  const d = DEFAULT_FLEET_CONTROL_SETTINGS;
  return {
    cycle_days:                  Number(data?.cycle_days ?? d.cycle_days),
    late_threshold_days:         Number(data?.late_threshold_days ?? d.late_threshold_days),
    relance_threshold:           Number(data?.relance_threshold ?? d.relance_threshold),
    auto_immobilisation_enabled: Boolean(data?.auto_immobilisation_enabled ?? d.auto_immobilisation_enabled),
    parking_check_interval_min:  Number(data?.parking_check_interval_min ?? d.parking_check_interval_min),
    relance_cooldown_hours:      Number(data?.relance_cooldown_hours ?? d.relance_cooldown_hours),
    require_all_photos:          Boolean(data?.require_all_photos ?? d.require_all_photos),
    require_documents:           Boolean(data?.require_documents ?? d.require_documents),
    // Default TRUE so the system never cuts a live engine until explicitly opted in.
    uffizio_immobilization_dry_run: data?.uffizio_immobilization_dry_run === false ? false : true,
  };
}

/**
 * Shared fleet-control settings query used by the admin Fleet Control page,
 * the Réglages settings card and the driver inspection screen.
 * 5-min staleTime; FleetControlSettingsCard invalidates the key on save.
 */
export function useFleetControlSettings() {
  return useQuery<FleetControlSettings>({
    queryKey: FLEET_CONTROL_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fleet_control_settings');
      if (error) throw error;
      return parseFleetControlSettings(data);
    },
    staleTime: 5 * 60_000,
  });
}
