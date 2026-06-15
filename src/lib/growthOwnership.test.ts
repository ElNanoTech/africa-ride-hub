import { describe, expect, it } from 'vitest';
import {
  buildGrowthOverview,
  buildGrowthProfiles,
  buildOfferEvaluations,
  deriveEligibilityState,
  type GrowthBlocker,
} from './growthOwnership';

describe('growth ownership helpers', () => {
  const today = '2026-06-15';
  const drivers = [
    { id: 'eligible', full_name: 'Awa Eligible', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh1' },
    { id: 'overdue', full_name: 'Kouame Overdue', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh2' },
    { id: 'kyc', full_name: 'Mariam KYC', kyc_status: 'pending', driver_status: 'active' },
    { id: 'approved', full_name: 'Jean Approved', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh3' },
  ];
  const scores = [
    { driver_id: 'eligible', score: 870, tier: 'A', calculation_week: '2026-06-15' },
    { driver_id: 'eligible', score: 860, tier: 'A', calculation_week: '2026-06-08' },
    { driver_id: 'eligible', score: 855, tier: 'A', calculation_week: '2026-06-01' },
    { driver_id: 'eligible', score: 852, tier: 'A', calculation_week: '2026-05-25' },
    { driver_id: 'eligible', score: 851, tier: 'A', calculation_week: '2026-05-18' },
    { driver_id: 'eligible', score: 850, tier: 'A', calculation_week: '2026-05-11' },
    { driver_id: 'eligible', score: 849, tier: 'A', calculation_week: '2026-05-04' },
    { driver_id: 'eligible', score: 848, tier: 'A', calculation_week: '2026-04-27' },
    { driver_id: 'eligible', score: 847, tier: 'A', calculation_week: '2026-04-20' },
    { driver_id: 'eligible', score: 846, tier: 'A', calculation_week: '2026-04-13' },
    { driver_id: 'eligible', score: 845, tier: 'A', calculation_week: '2026-04-06' },
    { driver_id: 'eligible', score: 844, tier: 'A', calculation_week: '2026-03-30' },
    { driver_id: 'overdue', score: 840, tier: 'B', calculation_week: '2026-06-15' },
    { driver_id: 'kyc', score: 560, tier: 'E', calculation_week: '2026-06-15' },
    { driver_id: 'approved', score: 890, tier: 'A', calculation_week: '2026-06-15' },
  ];
  const payments = [
    { id: 'p1', driver_id: 'eligible', status: 'paid', due_date: '2026-06-01', paid_date: '2026-06-01' },
    { id: 'p2', driver_id: 'eligible', status: 'paid', due_date: '2026-05-25', paid_date: '2026-05-25' },
    { id: 'p3', driver_id: 'eligible', status: 'paid', due_date: '2026-05-18', paid_date: '2026-05-18' },
    { id: 'p4', driver_id: 'overdue', status: 'pending', due_date: '2026-05-01' },
    { id: 'p5', driver_id: 'approved', status: 'paid', due_date: '2026-06-01', paid_date: '2026-06-01' },
  ];

  it('builds explainable growth profiles from existing platform signals', () => {
    const profiles = buildGrowthProfiles({
      drivers,
      scores,
      payments,
      wallets: [
        { driver_id: 'eligible', balance: 50_000 },
        { driver_id: 'overdue', balance: 0 },
      ],
      loans: [
        { id: 'l1', driver_id: 'approved', status: 'approved', loan_type: 'car_loan', amount_requested: 4_000_000, amount_approved: 3_500_000, applied_at: '2026-06-12' },
      ],
      contracts: [],
      rentals: [
        { id: 'r1', driver_id: 'eligible', vehicle_id: 'veh1', status: 'active', start_date: '2026-01-01' },
      ],
      violations: [],
      accidents: [],
      controls: [],
      risks: [],
      today,
    });

    const eligible = profiles.find((profile) => profile.driverId === 'eligible');
    const overdue = profiles.find((profile) => profile.driverId === 'overdue');
    const kyc = profiles.find((profile) => profile.driverId === 'kyc');
    const approved = profiles.find((profile) => profile.driverId === 'approved');

    expect(eligible).toMatchObject({
      lifecycleStage: 'Financing Eligible Driver',
      eligibilityState: 'ELIGIBLE_FOR_REVIEW',
      canPublishOffer: false,
    });
    expect(eligible?.publishDisabledReason).toContain('Part 1 is admin-only');
    expect(eligible?.offers.some((offer) => offer.criteriaMet)).toBe(true);
    expect(eligible?.offers.some((offer) => offer.eligible)).toBe(false);
    expect(overdue?.eligibilityState).toBe('NOT_ELIGIBLE');
    expect(overdue?.blockers.map((blocker) => blocker.key)).toContain('overdue');
    expect(kyc?.blockers.map((blocker) => blocker.key)).toEqual(expect.arrayContaining(['kyc', 'score_low']));
    expect(approved?.eligibilityState).toBe('ACTIVATION_PENDING');
    expect(approved?.recommendations).toContain('Confirm down payment, contract signature, vehicle assignment, and Financial Engine activation.');
  });

  it('summarizes the growth conversion funnel', () => {
    const profiles = buildGrowthProfiles({
      drivers,
      scores,
      payments,
      wallets: [],
      loans: [],
      contracts: [{ id: 'c1', driver_id: 'eligible', status: 'completed', ownership_percentage: 100 }],
      rentals: [],
      violations: [],
      accidents: [],
      controls: [],
      risks: [],
      today,
    });
    const overview = buildGrowthOverview(profiles);

    expect(overview.totalDrivers).toBe(4);
    expect(overview.ownershipPathDrivers).toBeGreaterThan(0);
    expect(overview.activeOffers).toBe(0);
    expect(overview.conversionFunnel['Vehicle Owner']).toBe(1);
  });

  it('keeps publish blocked when a driver has risk blockers', () => {
    const blockers: GrowthBlocker[] = [
      { key: 'risk_flag', label: 'Trust & Risk flag requires manual review', severity: 'critical', source: 'risk' },
    ];
    const offers = buildOfferEvaluations({ score: 900, weeksHistory: 30, onTimeRate: 100, blockers });

    expect(offers[0]).toMatchObject({
      driverOfferState: 'LOCKED_WITH_REASON',
      eligible: false,
      criteriaMet: false,
    });
    expect(deriveEligibilityState({ blockers, offers, currentApplication: null, ownershipContract: null })).toBe('NOT_ELIGIBLE');
  });
});
