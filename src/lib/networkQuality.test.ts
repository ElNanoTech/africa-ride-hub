import { describe, expect, it } from 'vitest';
import { deriveNetworkQuality } from './networkQuality';

describe('deriveNetworkQuality', () => {
  it('marks offline when the browser reports no network', () => {
    expect(deriveNetworkQuality({ onLine: false })).toBe('offline');
  });

  it('marks save-data and 2G links as poor', () => {
    expect(deriveNetworkQuality({ onLine: true, saveData: true })).toBe('poor');
    expect(deriveNetworkQuality({ onLine: true, effectiveType: '2g' })).toBe('poor');
    expect(deriveNetworkQuality({ onLine: true, effectiveType: 'slow-2g' })).toBe('poor');
  });

  it('marks very low downlink or high latency as poor', () => {
    expect(deriveNetworkQuality({ onLine: true, downlink: 0.5 })).toBe('poor');
    expect(deriveNetworkQuality({ onLine: true, rtt: 1500 })).toBe('poor');
  });

  it('keeps normal connections online', () => {
    expect(deriveNetworkQuality({ onLine: true, effectiveType: '4g', downlink: 5, rtt: 80 })).toBe('online');
  });
});
