import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverCreditScores, useDriverCurrentScore, useDriverId, useDriverLoans, useDriverPayments, useDriverRentals } from '@/hooks/useDriverData';
import { useDriverFullProfile } from '@/hooks/useDriverProfile';
import { useDriverRisk } from '@/hooks/useDriverRisk';
import { useDriverRealtimeSubscription } from '@/hooks/useDriverRealtimeSubscription';
import {
  buildDriverJourney,
  buildGrowthProfiles,
  type DriverJourneySummary,
  type GrowthAccidentLike,
  type GrowthContractLike,
  type GrowthDriverLike,
  type GrowthDriverProfile,
  type GrowthFleetControlLike,
  type GrowthPaymentLike,
  type GrowthRentalLike,
  type GrowthScoreLike,
  type GrowthVehicleLike,
  type GrowthViolationLike,
  type GrowthWalletLike,
} from '@/lib/growthOwnership';

const EMPTY_PAYMENTS: GrowthPaymentLike[] = [];
const EMPTY_CONTRACTS: GrowthContractLike[] = [];
const EMPTY_RENTALS: GrowthRentalLike[] = [];
const EMPTY_VIOLATIONS: GrowthViolationLike[] = [];
const EMPTY_ACCIDENTS: GrowthAccidentLike[] = [];
const EMPTY_CONTROLS: GrowthFleetControlLike[] = [];
const EMPTY_VEHICLES: GrowthVehicleLike[] = [];

const DRIVER_JOURNEY_REALTIME_TABLES: Parameters<typeof useDriverRealtimeSubscription>[0]['tables'] = [
  'notifications',
  'drivers',
  'loans',
  'rentals',
  'payments',
  'invoice',
  'driver_wallets',
  'driver_wallet_transactions',
  'credit_scores',
  'driver_scores',
  'driver_score_events',
  'kyc_submissions',
  'vehicles',
  'vehicle_inspections',
  'traffic_violations',
  'accidents',
  'rent_to_own_contracts',
];

export type DriverJourneyData = {
  today: string;
  profile: GrowthDriverProfile | null;
  journey: DriverJourneySummary | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

export function useDriverJourneyData(): DriverJourneyData {
  const { data: driverId, isLoading: driverIdLoading } = useDriverId();
  const driverProfile = useDriverFullProfile();
  const paymentsQuery = useDriverPayments();
  const loansQuery = useDriverLoans();
  const rentalsQuery = useDriverRentals();
  const creditScoresQuery = useDriverCreditScores();
  const currentScoreQuery = useDriverCurrentScore();
  const riskQuery = useDriverRisk(driverId ?? undefined);

  useDriverRealtimeSubscription({
    tables: DRIVER_JOURNEY_REALTIME_TABLES,
    showToasts: false,
  });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const since365 = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 365);
    return date.toISOString().slice(0, 10);
  }, []);

  const walletQuery = useQuery({
    queryKey: ['driver-journey', 'wallet', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<GrowthWalletLike[]> => {
      const { data, error } = await supabase
        .from('driver_wallets')
        .select('driver_id, balance, updated_at')
        .eq('driver_id', driverId!)
        .maybeSingle();
      if (error) throw error;
      return data ? [data] : [];
    },
  });

  const contractsQuery = useQuery({
    queryKey: ['driver-journey', 'contracts', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<GrowthContractLike[]> => {
      const { data, error } = await supabase
        .from('rent_to_own_contracts')
        .select('id, driver_id, vehicle_id, status, ownership_percentage, total_paid, total_price, weekly_payment, weeks_completed, contract_duration_weeks, start_date, expected_end_date, completed_at')
        .eq('driver_id', driverId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const violationsQuery = useQuery({
    queryKey: ['driver-journey', 'violations', driverId, since365, today],
    enabled: !!driverId,
    queryFn: async (): Promise<GrowthViolationLike[]> => {
      const { data, error } = await supabase
        .from('traffic_violations')
        .select('id, driver_id, status')
        .eq('driver_id', driverId!)
        .gte('violation_date', since365)
        .lte('violation_date', today)
        .order('violation_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const accidentsQuery = useQuery({
    queryKey: ['driver-journey', 'accidents', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<GrowthAccidentLike[]> => {
      const { data, error } = await supabase
        .from('accidents')
        .select('id, driver_id, status, severity')
        .eq('driver_id', driverId!)
        .order('accident_datetime', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const controlsQuery = useQuery({
    queryKey: ['driver-journey', 'fleet-control', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<GrowthFleetControlLike[]> => {
      const { data, error } = await supabase
        .from('vehicle_inspections')
        .select('id, driver_id, vehicle_id, status, due_at, immobilization_state, immobilized_at')
        .eq('driver_id', driverId!)
        .order('due_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const contracts = contractsQuery.data ?? EMPTY_CONTRACTS;
  const rentals = useMemo(() => (rentalsQuery.data ?? EMPTY_RENTALS) as GrowthRentalLike[], [rentalsQuery.data]);
  const vehicleIds = useMemo(() => {
    const ids = [
      (driverProfile.data as GrowthDriverLike | null | undefined)?.active_vehicle_id,
      ...rentals.map((rental) => rental.vehicle_id),
      ...contracts.map((contract) => contract.vehicle_id),
    ].filter((value): value is string => Boolean(value));
    return [...new Set(ids)];
  }, [contracts, driverProfile.data, rentals]);

  const vehiclesQuery = useQuery({
    queryKey: ['driver-journey', 'vehicles', vehicleIds.join(',')],
    enabled: !!driverId && vehicleIds.length > 0,
    queryFn: async (): Promise<GrowthVehicleLike[]> => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, status, make, model_name, license_plate')
        .in('id', vehicleIds)
        .order('license_plate', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const scores = useMemo<GrowthScoreLike[]>(() => {
    if (!driverId) return [];
    const rows = ((creditScoresQuery.data ?? []) as GrowthScoreLike[]).map((score) => ({
      driver_id: score.driver_id,
      score: score.score,
      tier: score.tier,
      calculation_week: score.calculation_week,
      created_at: score.created_at,
    }));
    const currentScore = currentScoreQuery.data;
    if (currentScore == null) return rows;
    if (rows[0]?.score === currentScore) return rows;
    return [
      {
        driver_id: driverId,
        score: currentScore,
        tier: rows[0]?.tier ?? null,
        calculation_week: today,
        created_at: today,
      },
      ...rows,
    ];
  }, [creditScoresQuery.data, currentScoreQuery.data, driverId, today]);

  const profile = useMemo<GrowthDriverProfile | null>(() => {
    const driver = driverProfile.data as GrowthDriverLike | null | undefined;
    if (!driver || !driverId) return null;

    const risks = riskQuery.data
      ? [{ driver_id: driverId, level: riskQuery.data.level, reasons: [] }]
      : [];

    return buildGrowthProfiles({
      drivers: [driver],
      scores,
      payments: (paymentsQuery.data ?? EMPTY_PAYMENTS) as GrowthPaymentLike[],
      wallets: walletQuery.data ?? [],
      loans: loansQuery.data ?? [],
      contracts,
      rentals,
      vehicles: vehiclesQuery.data ?? EMPTY_VEHICLES,
      violations: violationsQuery.data ?? EMPTY_VIOLATIONS,
      accidents: accidentsQuery.data ?? EMPTY_ACCIDENTS,
      controls: controlsQuery.data ?? EMPTY_CONTROLS,
      risks,
      today,
    })[0] ?? null;
  }, [
    accidentsQuery.data,
    contracts,
    controlsQuery.data,
    driverId,
    driverProfile.data,
    loansQuery.data,
    paymentsQuery.data,
    rentals,
    riskQuery.data,
    scores,
    today,
    vehiclesQuery.data,
    violationsQuery.data,
    walletQuery.data,
  ]);

  const journey = useMemo(() => profile ? buildDriverJourney(profile, today) : null, [profile, today]);
  const blockingQueries = [
    driverProfile,
    paymentsQuery,
    loansQuery,
    rentalsQuery,
    creditScoresQuery,
    currentScoreQuery,
    walletQuery,
    contractsQuery,
    violationsQuery,
    accidentsQuery,
    controlsQuery,
    vehiclesQuery,
  ];
  const isLoading = driverIdLoading || blockingQueries.some((query) => query.isLoading);
  const isError = blockingQueries.some((query) => query.isError);
  const error = blockingQueries.map((query) => query.error).find(Boolean) ?? null;

  return {
    today,
    profile,
    journey,
    isLoading,
    isError,
    error,
  };
}
