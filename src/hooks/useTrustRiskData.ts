import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { fetchAllRows } from '@/lib/fetchAll';
import { useDriversRiskSummary } from '@/hooks/useDriverRisk';
import { useRealtimeSubscription, type RealtimeTableName } from '@/hooks/useRealtimeSubscription';
import { useVehicleOperationsData } from '@/hooks/useVehicleOperationsData';
import {
  buildComplianceSummary,
  buildDriverRiskProfiles,
  buildScoreDimensions,
  buildScoreDistribution,
  buildTrustEvents,
  buildTrustOverview,
  buildVehicleRiskProfiles,
  type AccidentTrustLike,
  type CreditScoreTrustLike,
  type DriverScoreEventTrustLike,
  type DriverRiskProfile,
  type DriverTrustLike,
  type FleetControlTrustLike,
  type PaymentTrustLike,
  type TrustEvent,
  type TrustOverviewMetrics,
  type VehicleRiskProfile,
  type ViolationTrustLike,
} from '@/lib/trustRisk';

const TRUST_REALTIME_TABLES: RealtimeTableName[] = [
  'drivers',
  'credit_scores',
  'driver_scores',
  'driver_score_events',
  'payments',
  'kyc_submissions',
  'vehicle_inspections',
  'traffic_violations',
  'accidents',
];

const EMPTY_DRIVERS: DriverTrustLike[] = [];
const EMPTY_SCORES: CreditScoreTrustLike[] = [];
const EMPTY_SCORE_EVENTS: DriverScoreEventTrustLike[] = [];
const EMPTY_PAYMENTS: PaymentTrustLike[] = [];
const EMPTY_VIOLATIONS: ViolationTrustLike[] = [];
const EMPTY_ACCIDENTS: AccidentTrustLike[] = [];
const EMPTY_CONTROLS: FleetControlTrustLike[] = [];

export type TrustRiskData = {
  today: string;
  drivers: DriverTrustLike[];
  scores: CreditScoreTrustLike[];
  scoreEvents: DriverScoreEventTrustLike[];
  payments: PaymentTrustLike[];
  violations: ViolationTrustLike[];
  accidents: AccidentTrustLike[];
  controls: FleetControlTrustLike[];
  driverProfiles: DriverRiskProfile[];
  vehicleProfiles: VehicleRiskProfile[];
  events: TrustEvent[];
  overview: TrustOverviewMetrics;
  distribution: ReturnType<typeof buildScoreDistribution>;
  dimensions: ReturnType<typeof buildScoreDimensions>;
  compliance: ReturnType<typeof buildComplianceSummary>;
  canonicalRiskReasons: Map<string, string[]>;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

export function useTrustRiskData(enabled = true): TrustRiskData {
  useRealtimeSubscription({
    tables: TRUST_REALTIME_TABLES,
    showToasts: false,
    enabled,
  });

  const vehicleOps = useVehicleOperationsData(enabled);
  const riskSummary = useDriversRiskSummary(enabled);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const since180 = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 180);
    return date.toISOString().slice(0, 10);
  }, []);

  const driversQuery = useQuery({
    queryKey: ['trust-risk', 'drivers'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<DriverTrustLike>((from, to) =>
        supabase
          .from('drivers')
          .select('id, full_name, phone_number, driver_status, kyc_status, permit_expiry_date, active_vehicle_id, created_at')
          .order('full_name', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const scoresQuery = useQuery({
    queryKey: ['trust-risk', 'scores'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<CreditScoreTrustLike>((from, to) =>
        supabase
          .from('credit_scores')
          .select('driver_id, score, tier, calculation_week, created_at, driving_impact, payment_impact, income_impact, driving_data_available, payment_data_available, income_data_available')
          .order('calculation_week', { ascending: false })
          .order('driver_id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const scoreEventsQuery = useQuery({
    queryKey: ['trust-risk', 'score-events', since180, today],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<DriverScoreEventTrustLike>((from, to) =>
        supabase
          .from('driver_score_events')
          .select('id, driver_id, delta, reason, accident_id, created_at')
          .gte('created_at', since180)
          .lte('created_at', `${today}T23:59:59.999Z`)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ['trust-risk', 'payments', since180, today],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<PaymentTrustLike>((from, to) =>
        supabase
          .from('payments')
          .select('id, driver_id, rental_id, status, amount, amount_paid, due_date, paid_date, paid_at, payment_type, created_at')
          .gte('due_date', since180)
          .lte('due_date', today)
          .order('due_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const violationsQuery = useQuery({
    queryKey: ['trust-risk', 'violations', since180, today],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<ViolationTrustLike>((from, to) =>
        supabase
          .from('traffic_violations')
          .select('id, driver_id, vehicle_id, license_plate, violation_type, violation_date, amount, status, paid_at, created_at')
          .gte('violation_date', since180)
          .lte('violation_date', today)
          .order('violation_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const accidentsQuery = useQuery({
    queryKey: ['trust-risk', 'accidents'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<AccidentTrustLike>((from, to) =>
        supabase
          .from('accidents')
          .select('id, driver_id, vehicle_id, case_number, status, severity, accident_datetime, closed_at, created_at')
          .order('accident_datetime', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const controlsQuery = useQuery({
    queryKey: ['trust-risk', 'fleet-control'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<FleetControlTrustLike>((from, to) =>
        supabase
          .from('vehicle_inspections')
          .select('id, driver_id, vehicle_id, status, due_at, validated_at, last_validated_at, immobilization_state, immobilized_at, created_at')
          .order('due_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const drivers = driversQuery.data ?? EMPTY_DRIVERS;
  const scores = scoresQuery.data ?? EMPTY_SCORES;
  const scoreEvents = scoreEventsQuery.data ?? EMPTY_SCORE_EVENTS;
  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const violations = violationsQuery.data ?? EMPTY_VIOLATIONS;
  const accidents = accidentsQuery.data ?? EMPTY_ACCIDENTS;
  const controls = controlsQuery.data ?? EMPTY_CONTROLS;

  const events = useMemo(() => buildTrustEvents({
    drivers,
    scores,
    scoreEvents,
    payments,
    violations,
    accidents,
    controls,
    today,
  }), [accidents, controls, drivers, payments, scoreEvents, scores, today, violations]);

  const driverProfiles = useMemo(() => buildDriverRiskProfiles({
    drivers,
    scores,
    payments,
    violations,
    accidents,
    controls,
    events,
    today,
  }), [accidents, controls, drivers, events, payments, scores, today, violations]);

  const vehicleProfiles = useMemo(
    () => buildVehicleRiskProfiles(vehicleOps.rows),
    [vehicleOps.rows],
  );

  const overview = useMemo(() => buildTrustOverview({
    profiles: driverProfiles,
    drivers,
    violations,
    accidents,
    controls,
    today,
  }), [accidents, controls, driverProfiles, drivers, today, violations]);

  const distribution = useMemo(
    () => buildScoreDistribution(driverProfiles),
    [driverProfiles],
  );

  const dimensions = useMemo(
    () => buildScoreDimensions(scores),
    [scores],
  );

  const compliance = useMemo(
    () => buildComplianceSummary({ drivers, controls, today }),
    [controls, drivers, today],
  );

  const canonicalRiskReasons = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of riskSummary.data ?? []) {
      map.set(row.driver_id, row.reasons);
    }
    return map;
  }, [riskSummary.data]);

  const queries = [driversQuery, scoresQuery, scoreEventsQuery, paymentsQuery, violationsQuery, accidentsQuery, controlsQuery];
  const isLoading = vehicleOps.isLoading || queries.some((query) => query.isLoading);
  const isError = vehicleOps.isError || queries.some((query) => query.isError);
  const error = vehicleOps.error ?? queries.map((query) => query.error).find(Boolean) ?? null;

  return {
    today,
    drivers,
    scores,
    scoreEvents,
    payments,
    violations,
    accidents,
    controls,
    driverProfiles,
    vehicleProfiles,
    events,
    overview,
    distribution,
    dimensions,
    compliance,
    canonicalRiskReasons,
    isLoading,
    isError,
    error,
  };
}
