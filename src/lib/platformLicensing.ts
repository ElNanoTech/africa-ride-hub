export type PlatformAccessState = 'ENABLED' | 'DISABLED' | 'HIDDEN' | 'BETA' | 'TRIAL' | 'EXPIRED' | 'PENDING' | 'LOCKED' | string;
export type PlatformEntitlementStatus = 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'DISABLED' | 'PENDING' | string;
export type PlatformFeatureState = 'ENABLED' | 'DISABLED' | 'HIDDEN' | 'BETA' | 'TRIAL' | string;

export type FeatureAccessResult = {
  allowed?: boolean | null;
  code?: string | null;
  message?: string | null;
  feature_key?: string | null;
  feature_name?: string | null;
  category?: string | null;
  module_key?: string | null;
  access_state?: PlatformAccessState | null;
  feature_state?: PlatformFeatureState | null;
  entitlement_status?: PlatformEntitlementStatus | null;
  source?: string | null;
  plan_name?: string | null;
  expires_at?: string | null;
  upgrade_copy?: {
    benefits?: string[];
    cta?: string;
    [key: string]: unknown;
  } | null;
};

export type EntitlementMatrixSummary = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan_key: string | null;
  plan_name: string | null;
  feature_key: string;
  feature_name: string;
  category: string;
  module_key: string;
  access_state: PlatformAccessState;
  entitlement_status: PlatformEntitlementStatus | null;
  feature_state: PlatformFeatureState | null;
  source: string | null;
  expires_at?: string | null;
};

export type UsageLimitSummary = {
  usage_limit_id?: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  limit_key: string;
  limit_name: string;
  limit_value: number | null;
  hard_limit: boolean;
  current_usage: number;
  limit_status: 'OK' | 'NEAR_LIMIT' | 'EXCEEDED' | 'UNLIMITED' | string;
};

export const PREMIUM_MODULE_FEATURES = {
  trust: 'trust_center',
  growth: 'growth_center',
  credit: 'credit_products',
  underwriting: 'underwriting',
  contracts: 'contracts',
  repayment: 'repayment',
  collections: 'collections',
  recovery: 'recovery',
  ownership: 'ownership_completion',
  intelligence: 'portfolio_analytics',
} as const;

export function accessStateLabel(state: PlatformAccessState | null | undefined) {
  switch (state) {
    case 'ENABLED': return 'Enabled';
    case 'TRIAL': return 'Trial';
    case 'BETA': return 'Beta';
    case 'DISABLED': return 'Disabled';
    case 'HIDDEN': return 'Hidden';
    case 'EXPIRED': return 'Expired';
    case 'PENDING': return 'Pending';
    case 'LOCKED': return 'Locked';
    default: return state ?? 'Unknown';
  }
}

export function accessStateTone(state: PlatformAccessState | null | undefined) {
  switch (state) {
    case 'ENABLED': return 'verified';
    case 'TRIAL': return 'secondary';
    case 'BETA': return 'secondary';
    case 'PENDING': return 'outline';
    case 'HIDDEN': return 'outline';
    case 'DISABLED': return 'destructive';
    case 'EXPIRED': return 'destructive';
    case 'LOCKED': return 'destructive';
    default: return 'outline';
  }
}

export function shouldShowNavigationItem(access: FeatureAccessResult | null | undefined) {
  if (!access) return true;
  return access.access_state !== 'HIDDEN' && access.feature_state !== 'HIDDEN' && access.code !== 'FEATURE_HIDDEN';
}

export function isFeatureAllowed(access: FeatureAccessResult | null | undefined) {
  return !!access?.allowed || ['ENABLED', 'TRIAL', 'BETA'].includes(access?.access_state ?? '');
}

export function lockedModuleTitle(access: FeatureAccessResult | null | undefined, fallbackName: string) {
  if (access?.access_state === 'EXPIRED') return `${fallbackName} trial expired`;
  if (access?.access_state === 'PENDING') return `${fallbackName} pending activation`;
  return `${fallbackName} is not licensed`;
}

export function lockedModuleMessage(access: FeatureAccessResult | null | undefined, fallbackName: string) {
  if (access?.message) return access.message;
  return `${fallbackName} is available as a premium module. Core fleet operations remain available.`;
}

export function usageStatusTone(status: UsageLimitSummary['limit_status'] | null | undefined) {
  switch (status) {
    case 'OK': return 'verified';
    case 'UNLIMITED': return 'secondary';
    case 'NEAR_LIMIT': return 'secondary';
    case 'EXCEEDED': return 'destructive';
    default: return 'outline';
  }
}

export function usagePercent(limit: UsageLimitSummary) {
  if (limit.limit_value === null || limit.limit_value === undefined || limit.limit_value <= 0) {
    return limit.limit_status === 'EXCEEDED' ? 100 : 0;
  }
  return Math.min(100, Math.round((limit.current_usage / limit.limit_value) * 100));
}

export function summarizeTenantAccess(rows: EntitlementMatrixSummary[]) {
  const total = rows.length;
  const enabled = rows.filter((row) => ['ENABLED', 'TRIAL', 'BETA'].includes(row.access_state)).length;
  const locked = rows.filter((row) => ['DISABLED', 'LOCKED', 'EXPIRED', 'PENDING'].includes(row.access_state)).length;
  const hidden = rows.filter((row) => row.access_state === 'HIDDEN').length;

  return { total, enabled, locked, hidden };
}

export function buildLicensingExportRows(
  entitlements: EntitlementMatrixSummary[],
  usageLimits: UsageLimitSummary[],
) {
  const entitlementRows = entitlements.map((row) => ({
    section: 'Entitlement',
    tenant: row.tenant_name,
    package: row.plan_name ?? row.plan_key ?? 'No package',
    item: row.feature_name,
    state: accessStateLabel(row.access_state),
    source: row.source ?? 'n/a',
  }));

  const usageRows = usageLimits.map((limit) => ({
    section: 'Usage Limit',
    tenant: limit.tenant_name,
    package: 'Usage',
    item: limit.limit_name,
    state: limit.limit_value === null ? 'Unlimited' : `${limit.current_usage}/${limit.limit_value}`,
    source: limit.limit_status,
  }));

  return [...entitlementRows, ...usageRows];
}
