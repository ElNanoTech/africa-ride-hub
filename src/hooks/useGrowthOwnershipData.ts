import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { fetchAllRows } from '@/lib/fetchAll';
import { useDriversRiskSummary } from '@/hooks/useDriverRisk';
import { useRealtimeSubscription, type RealtimeTableName } from '@/hooks/useRealtimeSubscription';
import {
  buildGrowthOverview,
  buildGrowthProfiles,
  type GrowthAccidentLike,
  type GrowthContractLike,
  type GrowthDriverLike,
  type GrowthDriverProfile,
  type GrowthFleetControlLike,
  type GrowthLoanLike,
  type GrowthOverview,
  type GrowthPaymentLike,
  type GrowthRentalLike,
  type GrowthRiskLike,
  type GrowthScoreLike,
  type GrowthVehicleLike,
  type GrowthViolationLike,
  type GrowthWalletLike,
} from '@/lib/growthOwnership';

const GROWTH_REALTIME_TABLES: RealtimeTableName[] = [
  'drivers',
  'credit_scores',
  'driver_scores',
  'driver_score_events',
  'payments',
  'driver_wallets',
  'driver_wallet_transactions',
  'invoice',
  'kyc_submissions',
  'vehicle_inspections',
  'traffic_violations',
  'accidents',
  'loans',
  'rentals',
  'rent_to_own_contracts',
  'vehicles',
  'credit_default_reviews',
  'credit_default_decisions',
  'credit_recovery_plans',
  'credit_asset_protection_reviews',
];

const EMPTY_DRIVERS: GrowthDriverLike[] = [];
const EMPTY_SCORES: GrowthScoreLike[] = [];
const EMPTY_PAYMENTS: GrowthPaymentLike[] = [];
const EMPTY_WALLETS: GrowthWalletLike[] = [];
const EMPTY_LOANS: GrowthLoanLike[] = [];
const EMPTY_CONTRACTS: GrowthContractLike[] = [];
const EMPTY_RENTALS: GrowthRentalLike[] = [];
const EMPTY_VIOLATIONS: GrowthViolationLike[] = [];
const EMPTY_ACCIDENTS: GrowthAccidentLike[] = [];
const EMPTY_CONTROLS: GrowthFleetControlLike[] = [];
const EMPTY_VEHICLES: GrowthVehicleLike[] = [];

type GrowthDefaultReviewRow = {
  default_review_id: string;
  driver_id: string | null;
  status: string | null;
  status_label: string | null;
  past_due_amount: number | null;
};

const EMPTY_DEFAULT_REVIEWS: GrowthDefaultReviewRow[] = [];

export type GrowthOwnershipData = {
  today: string;
  drivers: GrowthDriverLike[];
  scores: GrowthScoreLike[];
  payments: GrowthPaymentLike[];
  wallets: GrowthWalletLike[];
  loans: GrowthLoanLike[];
  contracts: GrowthContractLike[];
  rentals: GrowthRentalLike[];
  violations: GrowthViolationLike[];
  accidents: GrowthAccidentLike[];
  controls: GrowthFleetControlLike[];
  vehicles: GrowthVehicleLike[];
  risks: GrowthRiskLike[];
  profiles: GrowthDriverProfile[];
  overview: GrowthOverview;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

export function useGrowthOwnershipData(enabled = true): GrowthOwnershipData {
  useRealtimeSubscription({
    tables: GROWTH_REALTIME_TABLES,
    showToasts: false,
    enabled,
  });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const since365 = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 365);
    return date.toISOString().slice(0, 10);
  }, []);
  const riskSummary = useDriversRiskSummary(enabled);

  const driversQuery = useQuery({
    queryKey: ['growth-ownership', 'drivers'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthDriverLike>((from, to) =>
      supabase
        .from('drivers')
        .select('id, full_name, phone_number, driver_status, kyc_status, active_vehicle_id, created_at')
        .order('full_name', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const scoresQuery = useQuery({
    queryKey: ['growth-ownership', 'scores'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthScoreLike>((from, to) =>
      supabase
        .from('credit_scores')
        .select('driver_id, score, tier, calculation_week, created_at')
        .order('calculation_week', { ascending: false })
        .order('driver_id', { ascending: true })
        .range(from, to),
    ),
  });

  const paymentsQuery = useQuery({
    queryKey: ['growth-ownership', 'payments', since365, today],
    enabled,
    queryFn: async () => fetchAllRows<GrowthPaymentLike>((from, to) =>
      supabase
        .from('payments')
        .select('id, driver_id, status, amount, amount_paid, due_date, paid_date, paid_at, payment_type, created_at')
        .gte('due_date', since365)
        .lte('due_date', today)
        .order('due_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const walletsQuery = useQuery({
    queryKey: ['growth-ownership', 'wallets'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthWalletLike>((from, to) =>
      supabase
        .from('driver_wallets')
        .select('driver_id, balance, updated_at')
        .order('driver_id', { ascending: true })
        .range(from, to),
    ),
  });

  const loansQuery = useQuery({
    queryKey: ['growth-ownership', 'loans'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthLoanLike>((from, to) =>
      supabase
        .from('loans')
        .select('id, driver_id, loan_type, status, amount_requested, amount_approved, applied_at, approved_at, disbursed_at, rejection_reason')
        .order('applied_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const contractsQuery = useQuery({
    queryKey: ['growth-ownership', 'contracts'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthContractLike>((from, to) =>
      supabase
        .from('rent_to_own_contracts')
        .select('id, driver_id, vehicle_id, status, ownership_percentage, total_paid, total_price, weekly_payment, weeks_completed, contract_duration_weeks, start_date, expected_end_date, completed_at')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const rentalsQuery = useQuery({
    queryKey: ['growth-ownership', 'rentals'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthRentalLike>((from, to) =>
      supabase
        .from('rentals')
        .select('id, driver_id, vehicle_id, status, start_date, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const violationsQuery = useQuery({
    queryKey: ['growth-ownership', 'violations', since365, today],
    enabled,
    queryFn: async () => fetchAllRows<GrowthViolationLike>((from, to) =>
      supabase
        .from('traffic_violations')
        .select('id, driver_id, status')
        .gte('violation_date', since365)
        .lte('violation_date', today)
        .order('violation_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const accidentsQuery = useQuery({
    queryKey: ['growth-ownership', 'accidents'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthAccidentLike>((from, to) =>
      supabase
        .from('accidents')
        .select('id, driver_id, status, severity')
        .order('accident_datetime', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const controlsQuery = useQuery({
    queryKey: ['growth-ownership', 'fleet-control'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthFleetControlLike>((from, to) =>
      supabase
        .from('vehicle_inspections')
        .select('id, driver_id, vehicle_id, status, due_at, immobilization_state, immobilized_at')
        .order('due_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const vehiclesQuery = useQuery({
    queryKey: ['growth-ownership', 'vehicles'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthVehicleLike>((from, to) =>
      supabase
        .from('vehicles')
        .select('id, status, make, model_name, license_plate')
        .order('license_plate', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  });

  const defaultReviewsQuery = useQuery({
    queryKey: ['growth-ownership', 'credit-default-reviews'],
    enabled,
    queryFn: async () => fetchAllRows<GrowthDefaultReviewRow>((from, to) =>
      supabase
        .from('v_credit_default_review_queue')
        .select('default_review_id, driver_id, status, status_label, past_due_amount')
        .order('opened_at', { ascending: false })
        .order('default_review_id', { ascending: true })
        .range(from, to),
    ),
  });

  const drivers = driversQuery.data ?? EMPTY_DRIVERS;
  const scores = scoresQuery.data ?? EMPTY_SCORES;
  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const wallets = walletsQuery.data ?? EMPTY_WALLETS;
  const loans = loansQuery.data ?? EMPTY_LOANS;
  const contracts = contractsQuery.data ?? EMPTY_CONTRACTS;
  const rentals = rentalsQuery.data ?? EMPTY_RENTALS;
  const violations = violationsQuery.data ?? EMPTY_VIOLATIONS;
  const accidents = accidentsQuery.data ?? EMPTY_ACCIDENTS;
  const controls = controlsQuery.data ?? EMPTY_CONTROLS;
  const vehicles = vehiclesQuery.data ?? EMPTY_VEHICLES;
  const defaultReviews = defaultReviewsQuery.data ?? EMPTY_DEFAULT_REVIEWS;
  const risks = useMemo<GrowthRiskLike[]>(() => {
    const byDriver = new Map<string, GrowthRiskLike>();
    for (const row of riskSummary.data ?? []) {
      byDriver.set(row.driver_id, {
        driver_id: row.driver_id,
        level: row.level,
        reasons: row.reasons,
      });
    }
    for (const review of defaultReviews) {
      if (!review.driver_id) continue;
      const existing = byDriver.get(review.driver_id);
      const reason = `Default Recovery active: ${review.status_label ?? review.status ?? 'Dossier DAM'}`;
      byDriver.set(review.driver_id, {
        driver_id: review.driver_id,
        level: 'critique',
        reasons: [...(existing?.reasons ?? []), reason],
      });
    }
    return [...byDriver.values()];
  }, [defaultReviews, riskSummary.data]);

  const profiles = useMemo(() => buildGrowthProfiles({
    drivers,
    scores,
    payments,
    wallets,
    loans,
    contracts,
    rentals,
    vehicles,
    violations,
    accidents,
    controls,
    risks,
    today,
  }), [accidents, contracts, controls, drivers, loans, payments, rentals, risks, scores, today, vehicles, violations, wallets]);

  const overview = useMemo(() => buildGrowthOverview(profiles), [profiles]);
  const queries = [driversQuery, scoresQuery, paymentsQuery, walletsQuery, loansQuery, contractsQuery, rentalsQuery, violationsQuery, accidentsQuery, controlsQuery, vehiclesQuery, defaultReviewsQuery];
  const isLoading = queries.some((query) => query.isLoading);
  const isError = queries.some((query) => query.isError);
  const error = queries.map((query) => query.error).find(Boolean) ?? null;

  return {
    today,
    drivers,
    scores,
    payments,
    wallets,
    loans,
    contracts,
    rentals,
    violations,
    accidents,
    controls,
    vehicles,
    risks,
    profiles,
    overview,
    isLoading,
    isError,
    error,
  };
}
