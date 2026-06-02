import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQuery } from '@tanstack/react-query';

export interface DrivingBehaviorSummary {
  total_vehicles: number;
  currently_moving: number;
  currently_overspeeding: number;
  currently_idle_engine_on: number;
  avg_speed_moving: number;
  max_speed_fleet: number;
  total_trips: number;
  total_overspeed_events: number;
  total_harsh_events: number;
  total_idle_events: number;
  overspeeding_vehicles: string[];
}

export interface TripRecord {
  vehicle_no: string;
  start_time: string;
  end_time: string;
  distance_km: number;
  max_speed: number;
  avg_speed: number;
  duration_minutes: number;
  start_address: string;
  end_address: string;
  idle_time: number;
}

export interface OverspeedEvent {
  vehicle_no: string;
  datetime: string;
  speed: number;
  speed_limit: number;
  duration_seconds: number;
  location: string;
  lat: number;
  lng: number;
}

export interface HarshEvent {
  vehicle_no: string;
  event_type: string;
  datetime: string;
  speed: number;
  location: string;
  lat: number;
  lng: number;
  severity: string;
}

export interface IdleEvent {
  vehicle_no: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location: string;
  lat: number;
  lng: number;
}

export interface VehicleBehavior {
  vehicle_no: string;
  driver_name: string;
  current_speed: number;
  is_overspeeding: boolean;
  is_idle_engine_on: boolean;
  ignition: string;
  status: string;
}

export interface DrivingBehaviorData {
  summary: DrivingBehaviorSummary;
  trips: TripRecord[];
  overspeeding: OverspeedEvent[];
  harsh_events: HarshEvent[];
  idle_events: IdleEvent[];
  vehicle_behavior: VehicleBehavior[];
  raw_responses: Record<string, string>;
}

export function useDrivingBehavior(options: { fromDate?: string; toDate?: string; vehicleNo?: string } = {}) {
  const { fromDate, toDate, vehicleNo } = options;

  return useQuery<DrivingBehaviorData>({
    queryKey: ['driving-behavior', fromDate, toDate, vehicleNo],
    queryFn: async () => {
      const body: any = { action: 'getDrivingBehavior' };
      if (fromDate) body.from_date = fromDate;
      if (toDate) body.to_date = toDate;
      if (vehicleNo) body.vehicle_no = vehicleNo;

      const { data, error } = await supabase.functions.invoke('sync-uffizio', { body });
      
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch driving behavior');

      return {
        summary: data.summary || {},
        trips: data.trips || [],
        overspeeding: data.overspeeding || [],
        harsh_events: data.harsh_events || [],
        idle_events: data.idle_events || [],
        vehicle_behavior: data.vehicle_behavior || [],
        raw_responses: data.raw_responses || {},
      };
    },
    staleTime: 3 * 60 * 1000, // 3 min cache (API rate limit)
    retry: 1,
  });
}
