import { describe, expect, it } from 'vitest';
import {
  buildComplianceSummary,
  buildDriverRiskProfiles,
  buildScoreDistribution,
  buildTrustEvents,
  buildTrustOverview,
  buildVehicleRiskProfiles,
  isOpenAccident,
  scoreBand,
  simulateTrustScore,
} from './trustRisk';

describe('trust risk helpers', () => {
  const today = '2026-06-15';
  const drivers = [
    { id: 'd1', full_name: 'Awa Kone', phone_number: '0101', kyc_status: 'pending', permit_expiry_date: '2026-05-01', created_at: '2026-01-01' },
    { id: 'd2', full_name: 'Jean Kouame', phone_number: '0202', kyc_status: 'verified', permit_expiry_date: '2027-01-01', created_at: '2026-01-02' },
  ];
  const scores = [
    { driver_id: 'd1', score: 560, calculation_week: '2026-06-15', created_at: '2026-06-15', payment_impact: -20, driving_impact: -10, income_impact: 5 },
    { driver_id: 'd1', score: 640, calculation_week: '2026-06-08', created_at: '2026-06-08', payment_impact: -10, driving_impact: 0, income_impact: 5 },
    { driver_id: 'd2', score: 850, calculation_week: '2026-06-15', created_at: '2026-06-15', payment_impact: 10, driving_impact: 15, income_impact: 10 },
  ];
  const scoreEvents = [
    { id: 'se1', driver_id: 'd1', delta: -8, reason: 'Late payment penalty', created_at: '2026-06-12T08:00:00Z' },
  ];
  const payments = [
    { id: 'p1', driver_id: 'd1', status: 'pending', due_date: '2026-06-01', amount: 10_000 },
    { id: 'p2', driver_id: 'd1', status: 'overdue', due_date: '2026-06-03', amount: 12_000 },
    { id: 'p3', driver_id: 'd2', status: 'paid', due_date: '2026-06-10', paid_at: '2026-06-10', amount: 15_000 },
  ];
  const violations = [
    { id: 'v1', driver_id: 'd1', vehicle_id: 'veh1', status: 'pending_payment', amount: 5_000, violation_type: 'Speed', violation_date: '2026-06-04' },
    { id: 'v2', driver_id: 'd1', vehicle_id: 'veh1', status: 'paid', amount: 4_000, violation_type: 'Parking', violation_date: '2026-06-05' },
  ];
  const accidents = [
    { id: 'a1', driver_id: 'd1', vehicle_id: 'veh1', status: 'UNDER_REVIEW', severity: 'major', case_number: 'SIN-1', accident_datetime: '2026-06-06' },
  ];
  const controls = [
    { id: 'c1', driver_id: 'd1', vehicle_id: 'veh1', status: 'pending', due_at: '2026-06-01' },
    { id: 'c2', driver_id: 'd2', vehicle_id: 'veh2', status: 'validated', due_at: '2026-06-01', validated_at: '2026-06-01' },
  ];

  it('maps scores into the configured bands', () => {
    expect(scoreBand(950)).toBe('Excellent');
    expect(scoreBand(820)).toBe('Good');
    expect(scoreBand(740)).toBe('Average');
    expect(scoreBand(650)).toBe('At Risk');
    expect(scoreBand(599)).toBe('Critical');
  });

  it('builds explainable driver risk profiles and recommendations', () => {
    const events = buildTrustEvents({ drivers, scores, scoreEvents, payments, violations, accidents, controls, today });
    const profiles = buildDriverRiskProfiles({ drivers, scores, payments, violations, accidents, controls, events, today });

    expect(profiles[0]).toMatchObject({
      driverId: 'd1',
      risk: 'Critical',
      trend: -80,
      scoreBand: 'Critical',
    });
    expect(profiles[0].reasons).toEqual(expect.arrayContaining([
      'Score dropped 80 points',
      'Critical score (560)',
      '2 late payments',
      '1 unresolved fine',
      'Recent accident',
      'KYC expired or pending',
      'Fleet control overdue',
    ]));
    expect(profiles[0].recommendedActions).toEqual(expect.arrayContaining([
      'Relancer paiement',
      'Suspendre financement',
      'Mettre à jour KYC',
      'Examiner sinistre',
      'Réassigner véhicule',
    ]));
  });

  it('builds overview, distribution, compliance, and trust timeline', () => {
    const events = buildTrustEvents({ drivers, scores, scoreEvents, payments, violations, accidents, controls, today });
    const profiles = buildDriverRiskProfiles({ drivers, scores, payments, violations, accidents, controls, events, today });
    const overview = buildTrustOverview({ profiles, drivers, violations, accidents, controls, today });
    const compliance = buildComplianceSummary({ drivers, controls, today });
    const distribution = buildScoreDistribution(profiles);

    expect(overview).toMatchObject({
      averageScore: 705,
      driversAtRisk: 1,
      criticalDrivers: 1,
      openContraventions: 1,
      openSinistres: 1,
      kycIssues: 1,
      fleetControlIssues: 1,
    });
    expect(compliance).toMatchObject({ kyc: 'Warning', fleetControl: 'Warning', permits: 'Warning' });
    expect(distribution).toMatchObject({ Good: 1, Critical: 1 });
    expect(events.map((event) => event.event)).toEqual(expect.arrayContaining([
      'Late Payment',
      'Good Week',
      'Contravention Added',
      'Contravention Cleared',
      'Accident Reported',
      'Fleet Control Overdue',
      'Fleet Control Approved',
      'KYC Expired',
      'KYC Verified',
      'Late payment penalty',
    ]));
    expect(isOpenAccident({ status: 'DRAFT' })).toBe(false);
  });

  it('builds vehicle-level risk from open vehicle signals', () => {
    const vehicles = buildVehicleRiskProfiles([
      {
        vehicle: { id: 'veh1', model_name: 'Dzire', license_plate: 'QA-E2E-100' },
        label: 'Dzire - QA-E2E-100',
        currentDriverName: 'Awa Kone',
        health: { state: 'Critical', score: 40, reasons: ['GPS offline'] },
        openMaintenance: [{ status: 'open' }, { status: 'open' }],
        controls: [{ status: 'pending', due_at: '2026-06-01' }],
        violations: [{ status: 'pending_payment' }, { status: 'pending_payment' }],
        accidents: [{ status: 'UNDER_REVIEW' }],
        gpsPosition: { status: 'offline' },
      },
    ]);

    expect(vehicles[0]).toMatchObject({
      risk: 'Critical',
      assignedDriver: 'Awa Kone',
      recommendedAction: 'Open Fleet Control',
    });
    expect(vehicles[0].sources).toEqual(expect.arrayContaining([
      'Recent accident',
      'Repeated maintenance',
      'Overdue control',
      'GPS offline',
      'Multiple fines',
    ]));
  });

  it('simulates score changes without mutating score data', () => {
    expect(simulateTrustScore({ score: 560, paysOverdue: true, accidentRemoved: true, kycFixed: true })).toEqual({
      projectedScore: 620,
      delta: 60,
      applied: [
        'What if driver pays? +20',
        'What if accident removed? +30',
        'What if KYC fixed? +10',
      ],
    });
  });
});
