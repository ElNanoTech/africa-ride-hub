import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BASE_SCORE,
  DEFAULT_PAYMENT_SCORE_RULES,
  evaluateDriver,
  evaluatePayment,
  isAccidentScoreImpacting,
  penaltyForSeverity,
  clampScore,
  type DriverFixture,
} from './scoringEngine';
import { DEFAULT_ACCIDENT_PENALTIES } from './accidentScoring';

describe('scoring baseline', () => {
  it('seeds a brand-new driver with no events at exactly 500', () => {
    const result = evaluateDriver({ id: 'd1' });
    expect(result.base_score).toBe(500);
    expect(result.final_score).toBe(DEFAULT_BASE_SCORE);
    expect(result.applied_events).toHaveLength(0);
  });

  it('respects an explicitly seeded base_score', () => {
    expect(evaluateDriver({ id: 'd1', base_score: 720 }).final_score).toBe(720);
  });

  it('clamps within [0, 1000]', () => {
    expect(clampScore(-50)).toBe(0);
    expect(clampScore(1234)).toBe(1000);
    expect(clampScore(742.6)).toBe(743);
  });
});

describe('severity → penalty mapping', () => {
  it('matches the platform-configured penalties', () => {
    expect(penaltyForSeverity('MINOR')).toBe(DEFAULT_ACCIDENT_PENALTIES.MINOR);
    expect(penaltyForSeverity('MODERATE')).toBe(DEFAULT_ACCIDENT_PENALTIES.MODERATE);
    expect(penaltyForSeverity('SEVERE')).toBe(DEFAULT_ACCIDENT_PENALTIES.SEVERE);
  });

  it('all penalties are strictly negative', () => {
    expect(DEFAULT_ACCIDENT_PENALTIES.MINOR).toBeLessThan(0);
    expect(DEFAULT_ACCIDENT_PENALTIES.MODERATE).toBeLessThan(0);
    expect(DEFAULT_ACCIDENT_PENALTIES.SEVERE).toBeLessThan(0);
  });
});

describe('accident score-impact gate (open vs closed)', () => {
  it('does NOT impact score while accident is open / under review', () => {
    const openStatuses = [
      'DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'WAITING_DOCS',
      'INVESTIGATING',
      'PENDING_DETERMINATION',
    ] as const;
    for (const status of openStatuses) {
      expect(
        isAccidentScoreImpacting({ id: 'a', severity: 'SEVERE', status, at_fault: true }),
      ).toBe(false);
    }
  });

  it('does NOT impact score when closed but driver is not at fault', () => {
    expect(
      isAccidentScoreImpacting({ id: 'a', severity: 'SEVERE', status: 'CLOSED', at_fault: false }),
    ).toBe(false);
    expect(
      isAccidentScoreImpacting({
        id: 'a',
        severity: 'SEVERE',
        status: 'RESOLVED_NOT_AT_FAULT',
        at_fault: false,
      }),
    ).toBe(false);
  });

  it('DOES impact score when RESOLVED_AT_FAULT or CLOSED with at_fault=true', () => {
    expect(
      isAccidentScoreImpacting({
        id: 'a',
        severity: 'MINOR',
        status: 'RESOLVED_AT_FAULT',
        at_fault: true,
      }),
    ).toBe(true);
    expect(
      isAccidentScoreImpacting({
        id: 'a',
        severity: 'MINOR',
        status: 'CLOSED',
        at_fault: true,
      }),
    ).toBe(true);
  });

  it('admin override: score_impact=false suppresses the penalty', () => {
    expect(
      isAccidentScoreImpacting({
        id: 'a',
        severity: 'SEVERE',
        status: 'CLOSED',
        at_fault: true,
        score_impact: false,
      }),
    ).toBe(false);
  });
});

describe('penalty application by severity', () => {
  const driver = (severity: 'MINOR' | 'MODERATE' | 'SEVERE'): DriverFixture => ({
    id: `driver-${severity}`,
    accidents: [{ id: 'a1', severity, status: 'CLOSED', at_fault: true }],
  });

  it('MINOR closed at-fault → 500 - 30 = 470', () => {
    expect(evaluateDriver(driver('MINOR')).final_score).toBe(470);
  });

  it('MODERATE closed at-fault → 500 - 75 = 425', () => {
    expect(evaluateDriver(driver('MODERATE')).final_score).toBe(425);
  });

  it('SEVERE closed at-fault → 500 - 150 = 350', () => {
    expect(evaluateDriver(driver('SEVERE')).final_score).toBe(350);
  });
});

describe('integrated fixture: Driver Jean replay', () => {
  // Mirrors the real-world scenario reported by the customer:
  //   - Jean starts at 500.
  //   - SIN-...004 MINOR was closed (atomic-resolution fix later applied) → -30.
  //   - SIN-...005 SEVERE was closed at-fault → -150.
  //   - SIN-...006 MODERATE remains open (no penalty yet).
  const jean: DriverFixture = {
    id: 'jean',
    accidents: [
      { id: 'sin-4', severity: 'MINOR',    status: 'CLOSED',         at_fault: true },
      { id: 'sin-5', severity: 'SEVERE',   status: 'RESOLVED_AT_FAULT', at_fault: true },
      { id: 'sin-6', severity: 'MODERATE', status: 'INVESTIGATING' },
    ],
  };

  it('applies only the closed at-fault penalties (open MODERATE stays pending)', () => {
    const r = evaluateDriver(jean);
    expect(r.applied_events.map((e) => e.source_id).sort()).toEqual(['sin-4', 'sin-5']);
    expect(r.pending_accidents.map((a) => a.id)).toEqual(['sin-6']);
  });

  it("Jean's final score is 320 (500 - 30 - 150)", () => {
    expect(evaluateDriver(jean).final_score).toBe(320);
  });

  it('once the open MODERATE is also closed at-fault, score drops to 245', () => {
    const closedJean: DriverFixture = {
      ...jean,
      accidents: jean.accidents!.map((a) => ({ ...a, status: 'CLOSED', at_fault: true })),
    };
    expect(evaluateDriver(closedJean).final_score).toBe(245);
  });

  it('clamps at 0 when penalties exceed baseline', () => {
    const bombarded: DriverFixture = {
      id: 'd-low',
      base_score: 100,
      accidents: Array.from({ length: 5 }).map((_, i) => ({
        id: `a${i}`,
        severity: 'SEVERE' as const,
        status: 'CLOSED' as const,
        at_fault: true,
      })),
    };
    expect(evaluateDriver(bombarded).final_score).toBe(0);
});

describe('payment scoring rules', () => {
  it('rewards an on-time payment with the configured bonus', () => {
    const event = evaluatePayment({
      id: 'p1', status: 'paid', due_date: '2026-04-20', paid_date: '2026-04-20', payment_type: 'rental',
    });
    expect(event).toEqual({ delta: DEFAULT_PAYMENT_SCORE_RULES.on_time_bonus, reason: 'Paiement location à temps' });
  });

  it('penalizes a late payment and surfaces the days late in the reason', () => {
    const event = evaluatePayment({
      id: 'p2', status: 'paid', due_date: '2026-04-20', paid_date: '2026-04-23', payment_type: 'loan',
    });
    expect(event?.delta).toBe(DEFAULT_PAYMENT_SCORE_RULES.late_penalty);
    expect(event?.reason).toBe('Paiement prêt en retard (3 jours)');
  });

  it('penalizes overdue payments using the dedicated rule', () => {
    const event = evaluatePayment({ id: 'p3', status: 'overdue', payment_type: 'rental' });
    expect(event?.delta).toBe(DEFAULT_PAYMENT_SCORE_RULES.overdue_penalty);
    expect(event?.reason).toBe('Paiement location en souffrance');
  });

  it('ignores payments still pending or cancelled (no event)', () => {
    expect(evaluatePayment({ id: 'p4', status: 'pending' })).toBeNull();
    expect(evaluatePayment({ id: 'p5', status: 'cancelled' })).toBeNull();
  });

  it('respects the enabled=false kill switch from the business config', () => {
    expect(evaluatePayment(
      { id: 'p6', status: 'paid', due_date: '2026-04-20', paid_date: '2026-04-20' },
      { ...DEFAULT_PAYMENT_SCORE_RULES, enabled: false },
    )).toBeNull();
  });

  it('honors custom (admin-overridden) deltas', () => {
    const aggressive = { on_time_bonus: 10, late_penalty: -50, overdue_penalty: -100, enabled: true };
    expect(evaluatePayment(
      { id: 'p7', status: 'paid', due_date: '2026-04-20', paid_date: '2026-04-25' },
      aggressive,
    )?.delta).toBe(-50);
  });

  it('integration: 4 on-time + 1 late + 1 overdue applied to baseline 500', () => {
    const driver: DriverFixture = {
      id: 'consistent',
      payments: [
        { id: 'p1', status: 'paid', due_date: '2026-04-01', paid_date: '2026-04-01', payment_type: 'rental' },
        { id: 'p2', status: 'paid', due_date: '2026-04-08', paid_date: '2026-04-07', payment_type: 'rental' },
        { id: 'p3', status: 'paid', due_date: '2026-04-15', paid_date: '2026-04-15', payment_type: 'rental' },
        { id: 'p4', status: 'paid', due_date: '2026-04-22', paid_date: '2026-04-22', payment_type: 'rental' },
        { id: 'p5', status: 'paid', due_date: '2026-04-29', paid_date: '2026-05-02', payment_type: 'rental' },
        { id: 'p6', status: 'overdue', payment_type: 'rental' },
      ],
    };
    // 500 + 4*5 + (-10) + (-20) = 490
    expect(evaluateDriver(driver).final_score).toBe(490);
  });
});
});
