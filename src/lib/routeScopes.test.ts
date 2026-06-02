import { describe, expect, it } from 'vitest';
import { isAdminRoute, isDriverAppRoute } from './routeScopes';

describe('routeScopes', () => {
  it('keeps driver-only side effects out of admin routes', () => {
    expect(isAdminRoute('/admin')).toBe(true);
    expect(isAdminRoute('/admin/billing')).toBe(true);
    expect(isDriverAppRoute('/admin')).toBe(false);
    expect(isDriverAppRoute('/admin/login')).toBe(false);
    expect(isDriverAppRoute('/admin/billing')).toBe(false);
  });

  it('allows driver app routes to mount driver side effects', () => {
    expect(isDriverAppRoute('/driver')).toBe(true);
    expect(isDriverAppRoute('/driver/factures')).toBe(true);
    expect(isDriverAppRoute('/driver-dashboard')).toBe(true);
    expect(isDriverAppRoute('/notifications/settings')).toBe(true);
  });

  it('does not mount driver side effects on public or admin-login pages', () => {
    expect(isDriverAppRoute('/')).toBe(false);
    expect(isDriverAppRoute('/login')).toBe(false);
    expect(isDriverAppRoute('/factures/public/token')).toBe(false);
  });
});