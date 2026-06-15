import { describe, expect, it } from 'vitest';
import {
  buildDriverJourney,
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

  it('derives Part 2 workspace stages, queue, blockers, and analytics from source records', () => {
    const profiles = buildGrowthProfiles({
      drivers: [
        ...drivers,
        { id: 'started', full_name: 'Nafi Started', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh4', created_at: '2026-05-01' },
        { id: 'submitted', full_name: 'Ousmane Submitted', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh5', created_at: '2026-05-02' },
        { id: 'owner', full_name: 'Fatou Owner', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh6', created_at: '2026-04-01' },
      ],
      scores: [
        ...scores,
        { driver_id: 'started', score: 880, tier: 'A', calculation_week: '2026-06-15' },
        { driver_id: 'submitted', score: 875, tier: 'A', calculation_week: '2026-06-15' },
        { driver_id: 'owner', score: 910, tier: 'A', calculation_week: '2026-06-15' },
      ],
      payments,
      wallets: [],
      loans: [
        { id: 'l-started', driver_id: 'started', status: 'started', loan_type: 'car_loan', applied_at: '2026-06-10' },
        { id: 'l-submitted', driver_id: 'submitted', status: 'pending', loan_type: 'car_loan', applied_at: '2026-06-09' },
        { id: 'l-approved', driver_id: 'approved', status: 'approved', loan_type: 'car_loan', applied_at: '2026-06-08', approved_at: '2026-06-12' },
      ],
      contracts: [
        { id: 'c-owner', driver_id: 'owner', status: 'active', ownership_percentage: 40, start_date: '2026-06-01' },
      ],
      rentals: [],
      vehicles: [
        { id: 'veh4', status: 'active', make: 'Suzuki', model_name: 'Alto', license_plate: 'DK-100-AA' },
      ],
      violations: [],
      accidents: [],
      controls: [],
      risks: [],
      today,
    });
    const overview = buildGrowthOverview(profiles);
    const byId = new Map(profiles.map((profile) => [profile.driverId, profile]));

    expect(byId.get('started')).toMatchObject({
      pipelineStage: 'Application Started',
      ownershipPipelineStage: 'Application Started',
      currentVehicleLabel: 'DK-100-AA · Suzuki Alto',
    });
    expect(byId.get('submitted')?.pipelineStage).toBe('Submitted');
    expect(byId.get('approved')?.pipelineStage).toBe('Approved');
    expect(byId.get('owner')?.pipelineStage).toBe('Ownership Active');
    expect(overview.offersPublished).toBe(0);
    expect(overview.activeOffers).toBe(0);
    expect(overview.applicationsStarted).toBe(1);
    expect(overview.applicationsSubmitted).toBe(3);
    expect(overview.applicationsApproved).toBe(2);
    expect(overview.ownershipActive).toBe(1);
    expect(overview.growthFunnel.map((stage) => stage.label)).toContain('Offer Published');
    expect(overview.growthFunnel.find((stage) => stage.key === 'offer-published')?.count).toBe(0);
    expect(overview.topBlockers.some((blocker) => blocker.key === 'overdue')).toBe(true);
    expect(overview.priorityQueue.some((item) => item.key === 'applications-awaiting-review')).toBe(true);
    expect(overview.analytics.approvalRate).toBe(67);
    expect(overview.analytics.ownershipActivationRate).toBe(50);
  });

  it('models manual override review as note-and-audit gated without publishing offers', () => {
    const profiles = buildGrowthProfiles({
      drivers: [{ id: 'risk', full_name: 'Risk Review', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh-risk' }],
      scores: [{ driver_id: 'risk', score: 930, tier: 'A', calculation_week: '2026-06-15' }],
      payments: [{ id: 'risk-p1', driver_id: 'risk', status: 'paid', due_date: '2026-06-01', paid_date: '2026-06-01' }],
      wallets: [{ driver_id: 'risk', balance: 20_000 }],
      loans: [],
      contracts: [],
      rentals: [{ id: 'risk-r1', driver_id: 'risk', vehicle_id: 'veh-risk', status: 'active', start_date: '2026-01-01' }],
      violations: [],
      accidents: [],
      controls: [],
      risks: [{ driver_id: 'risk', level: 'critique', reasons: ['Manual hold'] }],
      today,
    });
    const profile = profiles[0];

    expect(profile.reviewRecommendation).toBe('Manual Override');
    expect(profile.canPublishOffer).toBe(false);
    expect(profile.publishDisabledReason).toContain('Trust & Risk');
    expect(profile.offers.every((offer) => offer.offerStatus === 'DRAFT')).toBe(true);
    expect(profile.offers.every((offer) => offer.eligible === false)).toBe(true);
  });

  it('builds a driver journey that explains progress without publishing fake opportunities', () => {
    const [profile] = buildGrowthProfiles({
      drivers: [{ id: 'eligible', full_name: 'Awa Eligible', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh1', created_at: '2026-01-01' }],
      scores: scores.filter((score) => score.driver_id === 'eligible'),
      payments: payments.filter((payment) => payment.driver_id === 'eligible'),
      wallets: [{ driver_id: 'eligible', balance: 120_000 }],
      loans: [],
      contracts: [],
      rentals: [{ id: 'r1', driver_id: 'eligible', vehicle_id: 'veh1', status: 'active', start_date: '2026-01-01' }],
      violations: [],
      accidents: [],
      controls: [],
      risks: [],
      today,
    });

    const journey = buildDriverJourney(profile, today);

    expect(journey.currentStage).toBe('Financing Eligible Driver');
    expect(journey.eligibility.state).toBe('Eligible For Review');
    expect(journey.roadmap.find((stage) => stage.stage === 'Financing Eligible Driver')?.status).toBe('current');
    expect(journey.nextActions).toHaveLength(1);
    expect(journey.opportunities[0]).toMatchObject({
      id: 'vehicle-ownership-program',
      isPublishedOffer: false,
      canStartApplication: false,
      status: 'Almost Ready',
    });
    expect(journey.activeOpportunityCount).toBe(0);
    expect(journey.simulatorDisclaimer).toContain('Does not guarantee financing');
    expect(journey.achievements.find((achievement) => achievement.key === 'score-above-700')?.achieved).toBe(true);
    expect(journey.milestones.find((milestone) => milestone.key === 'first-rental')?.achieved).toBe(true);
  });

  it('explains locked driver opportunities and limits next best actions to three', () => {
    const [profile] = buildGrowthProfiles({
      drivers: [{ id: 'blocked', full_name: 'Blocked Driver', kyc_status: 'pending', driver_status: 'active', created_at: '2026-06-01' }],
      scores: [{ driver_id: 'blocked', score: 560, tier: 'E', calculation_week: '2026-06-15' }],
      payments: [
        { id: 'b1', driver_id: 'blocked', status: 'pending', due_date: '2026-05-01' },
        { id: 'b2', driver_id: 'blocked', status: 'late', due_date: '2026-05-08', paid_date: '2026-05-12' },
      ],
      wallets: [{ driver_id: 'blocked', balance: -5_000 }],
      loans: [],
      contracts: [],
      rentals: [],
      violations: [{ id: 'v1', driver_id: 'blocked', status: 'open' }],
      accidents: [],
      controls: [],
      risks: [],
      today,
    });

    const journey = buildDriverJourney(profile, today);

    expect(journey.eligibility.state).toBe('Not Eligible');
    expect(journey.eligibility.requirementsMissing.map((requirement) => requirement.key)).toEqual(expect.arrayContaining(['identity', 'score', 'payment-history']));
    expect(journey.nextActions.length).toBeLessThanOrEqual(3);
    expect(journey.opportunities[0].status).toBe('Locked');
    expect(journey.opportunities[0].reason).toBeTruthy();
    expect(journey.opportunities[0].remaining).not.toBe('Aucune condition restante visible');
  });

  it('builds an application tracker from real loan and contract state', () => {
    const [profile] = buildGrowthProfiles({
      drivers: [{ id: 'submitted', full_name: 'Ousmane Submitted', kyc_status: 'verified', driver_status: 'active', active_vehicle_id: 'veh5', created_at: '2026-05-02' }],
      scores: [{ driver_id: 'submitted', score: 875, tier: 'A', calculation_week: '2026-06-15' }],
      payments: [{ id: 's1', driver_id: 'submitted', status: 'paid', due_date: '2026-06-01', paid_date: '2026-06-01' }],
      wallets: [],
      loans: [{ id: 'l-submitted', driver_id: 'submitted', status: 'under_review', loan_type: 'car_loan', applied_at: '2026-06-09' }],
      contracts: [],
      rentals: [],
      violations: [],
      accidents: [],
      controls: [],
      risks: [],
      today,
    });

    const journey = buildDriverJourney(profile, today);
    const tracker = new Map(journey.applicationTracker.map((stage) => [stage.key, stage.status]));

    expect(journey.eligibility.state).toBe('Application In Progress');
    expect(tracker.get('started')).toBe('completed');
    expect(tracker.get('submitted')).toBe('completed');
    expect(tracker.get('risk-review')).toBe('current');
    expect(tracker.get('approved')).toBe('locked');
    expect(journey.documents.some((document) => document.status === 'Missing')).toBe(true);
  });
});
