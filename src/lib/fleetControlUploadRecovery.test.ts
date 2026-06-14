import { describe, expect, it } from 'vitest';
import { makeFleetControlUploadId } from './fleetControlUploadRecovery';

describe('makeFleetControlUploadId', () => {
  it('keys one pending upload per inspection zone', () => {
    expect(makeFleetControlUploadId('inspection-1', 'front')).toBe('inspection-1:front');
  });
});
