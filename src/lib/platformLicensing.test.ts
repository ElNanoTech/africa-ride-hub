import { describe, expect, it } from 'vitest';
import {
  buildLicensingExportRows,
  isFeatureAllowed,
  lockedModuleTitle,
  shouldShowNavigationItem,
  summarizeTenantAccess,
  usagePercent,
} from './platformLicensing';

describe('platformLicensing helpers', () => {
  it('treats enabled, trial, and beta access as allowed', () => {
    expect(isFeatureAllowed({ allowed: false, access_state: 'TRIAL' })).toBe(true);
    expect(isFeatureAllowed({ allowed: true, access_state: 'ENABLED' })).toBe(true);
    expect(isFeatureAllowed({ allowed: false, access_state: 'LOCKED' })).toBe(false);
  });

  it('hides hidden features from navigation', () => {
    expect(shouldShowNavigationItem({ access_state: 'HIDDEN' })).toBe(false);
    expect(shouldShowNavigationItem({ feature_state: 'HIDDEN' })).toBe(false);
    expect(shouldShowNavigationItem({ access_state: 'DISABLED' })).toBe(true);
  });

  it('summarizes tenant access states', () => {
    const summary = summarizeTenantAccess([
      { tenant_id: '1', tenant_name: 'A', tenant_slug: 'a', plan_key: 'fleet_core', plan_name: 'Fleet Core', feature_key: 'driver_management', feature_name: 'Driver Management', category: 'CORE', module_key: 'fleet_core', access_state: 'ENABLED', entitlement_status: 'ACTIVE', feature_state: 'ENABLED', source: 'PLAN' },
      { tenant_id: '1', tenant_name: 'A', tenant_slug: 'a', plan_key: 'fleet_core', plan_name: 'Fleet Core', feature_key: 'credit_products', feature_name: 'Credit Products', category: 'CREDIT', module_key: 'credit', access_state: 'DISABLED', entitlement_status: 'DISABLED', feature_state: 'DISABLED', source: 'PLAN' },
      { tenant_id: '1', tenant_name: 'A', tenant_slug: 'a', plan_key: 'fleet_core', plan_name: 'Fleet Core', feature_key: 'marketplace', feature_name: 'Marketplace', category: 'FUTURE', module_key: 'future', access_state: 'HIDDEN', entitlement_status: 'DISABLED', feature_state: 'HIDDEN', source: 'PLAN' },
    ]);

    expect(summary).toEqual({ total: 3, enabled: 1, locked: 1, hidden: 1 });
  });

  it('calculates usage progress and export rows', () => {
    const limit = {
      tenant_id: '1',
      tenant_name: 'Fleet Core',
      tenant_slug: 'fleet-core',
      limit_key: 'driver_count',
      limit_name: 'Driver count',
      limit_value: 50,
      hard_limit: true,
      current_usage: 40,
      limit_status: 'NEAR_LIMIT',
    };

    expect(usagePercent(limit)).toBe(80);
    expect(lockedModuleTitle({ access_state: 'EXPIRED' }, 'Growth Center')).toBe('Growth Center trial expired');
    expect(buildLicensingExportRows([], [limit])).toEqual([
      {
        section: 'Usage Limit',
        tenant: 'Fleet Core',
        package: 'Usage',
        item: 'Driver count',
        state: '40/50',
        source: 'NEAR_LIMIT',
      },
    ]);
  });
});
