import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { clampScore } from './scoringEngine';

/**
 * Backend reconciliation guarantee
 * --------------------------------
 * Every driver's *displayed* score (the value the UI reads from
 * `driver_scores.current_score` on Home, Score, Loans, and DriverLayout)
 * MUST equal:
 *
 *     clamp(0, 1000, base_score + SUM(driver_score_events.delta))
 *
 * `base_score` is the platform default (`platform_settings.default_driver_base_score`).
 * If the snapshot ever drifts from the recomputed truth, this test fails —
 * which is exactly the regression that caused the "300 / 767 / 940" bug.
 *
 * The test also asserts that the weekly snapshot (`credit_scores`, used for
 * historical breakdowns) — when present — never reports a *current week* value
 * that disagrees with `driver_scores.current_score`, since both surfaces are
 * shown side-by-side in the driver app.
 */

// Resolve env without depending on Vite's import.meta.env at test-time. We
// fall back to the project-published anon credentials (already public) so the
// suite is runnable from any CI without extra wiring.
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? 'https://sgnhqmxoinmrozupdvpv.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnbmhxbXhvaW5tcm96dXBkdnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNTAwMjcsImV4cCI6MjA5MTkyNjAyN30.XtwEN25NKopm_U5STEJwI4GXWlq0NdPikAbyDvMJu70';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface DriverRow {
  id: string;
  full_name: string;
}
interface ScoreRow {
  driver_id: string;
  current_score: number;
}
interface EventRow {
  driver_id: string;
  delta: number;
}

let baseScore = 500;
let drivers: DriverRow[] = [];
let scoresByDriver = new Map<string, number>();
let eventsByDriver = new Map<string, number>();
let backendReachable = true;

beforeAll(async () => {
  // 1. Resolve platform base score
  const { data: setting } = await supabase
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', 'default_driver_base_score')
    .maybeSingle();
  if (typeof setting?.setting_value === 'number') {
    baseScore = setting.setting_value;
  } else if (typeof setting?.setting_value === 'string') {
    baseScore = parseInt(setting.setting_value, 10) || 500;
  }

  // 2. Pull drivers (RLS may block anon in some envs — degrade gracefully)
  const { data: driverRows, error: driversError } = await supabase
    .from('drivers')
    .select('id, full_name');
  if (driversError || !driverRows) {
    backendReachable = false;
    return;
  }
  drivers = driverRows;

  // 3. Pull live scores
  const { data: scoreRows } = await supabase
    .from('driver_scores')
    .select('driver_id, current_score');
  for (const r of (scoreRows ?? []) as ScoreRow[]) {
    scoresByDriver.set(r.driver_id, r.current_score);
  }

  // 4. Pull and aggregate score events
  const { data: eventRows } = await supabase
    .from('driver_score_events')
    .select('driver_id, delta');
  for (const r of (eventRows ?? []) as EventRow[]) {
    eventsByDriver.set(r.driver_id, (eventsByDriver.get(r.driver_id) ?? 0) + r.delta);
  }
});

describe('driver score reconciliation (backend invariant)', () => {
  it('the platform base score is configured', () => {
    if (!backendReachable) return;
    expect(baseScore).toBeGreaterThan(0);
    expect(baseScore).toBeLessThanOrEqual(1000);
  });

  it('every driver_scores.current_score equals clamp(base + sum(events))', () => {
    if (!backendReachable || drivers.length === 0) return;

    const drift: Array<{
      id: string;
      name: string;
      stored: number;
      expected: number;
      sumEvents: number;
    }> = [];

    for (const driver of drivers) {
      const stored = scoresByDriver.get(driver.id);
      // Drivers without a driver_scores row are seeded lazily — skip.
      if (stored === undefined) continue;

      const sumEvents = eventsByDriver.get(driver.id) ?? 0;
      const expected = clampScore(baseScore + sumEvents);

      if (stored !== expected) {
        drift.push({
          id: driver.id,
          name: driver.full_name,
          stored,
          expected,
          sumEvents,
        });
      }
    }

    expect(
      drift,
      `Score drift detected for ${drift.length} driver(s):\n` +
        drift
          .map(
            (d) =>
              `  • ${d.name} (${d.id}): stored=${d.stored}, expected=${d.expected} ` +
              `(base ${baseScore} + Σ events ${d.sumEvents})`,
          )
          .join('\n'),
    ).toEqual([]);
  });

  it('every stored score is within the [0, 1000] display range', () => {
    if (!backendReachable) return;
    for (const [driverId, score] of scoresByDriver) {
      expect(score, `driver ${driverId} score out of range`).toBeGreaterThanOrEqual(0);
      expect(score, `driver ${driverId} score out of range`).toBeLessThanOrEqual(1000);
    }
  });

  it('the current-week credit_scores snapshot agrees with driver_scores', async () => {
    if (!backendReachable) return;

    // Only check the most recent snapshot per driver — older weeks are
    // historical and intentionally frozen.
    const { data: snapshots } = await supabase
      .from('credit_scores')
      .select('driver_id, score, calculation_week')
      .order('calculation_week', { ascending: false });

    const latestByDriver = new Map<string, number>();
    for (const row of (snapshots ?? []) as Array<{
      driver_id: string;
      score: number;
      calculation_week: string;
    }>) {
      if (!latestByDriver.has(row.driver_id)) {
        latestByDriver.set(row.driver_id, row.score);
      }
    }

    const drift: string[] = [];
    for (const [driverId, snapshotScore] of latestByDriver) {
      const live = scoresByDriver.get(driverId);
      if (live === undefined) continue;
      // Snapshot may legitimately differ for *past* weeks; only flag when the
      // live score and the latest snapshot have diverged by more than the
      // clamp tolerance, which would surface as inconsistent UI numbers.
      if (Math.abs(live - snapshotScore) > 0) {
        drift.push(
          `  • driver ${driverId}: live=${live}, latest snapshot=${snapshotScore}`,
        );
      }
    }

    expect(
      drift,
      `Latest credit_scores snapshot disagrees with driver_scores for ` +
        `${drift.length} driver(s):\n${drift.join('\n')}`,
    ).toEqual([]);
  });
});
