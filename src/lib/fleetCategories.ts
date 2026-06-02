// Fleet categories used to classify vehicles for fleet operations.
// Stored in `vehicles.fleet_group` (constraint: NULL | VTC | WARREN | CARGO | NLOOTTO).
// `N'LOOTTO` uses the apostrophe-less DB value to keep the CHECK constraint simple.

export type FleetCategory = 'WARREN' | 'VTC' | 'CARGO' | 'NLOOTTO';

export const FLEET_CATEGORIES: { value: FleetCategory; label: string }[] = [
  { value: 'WARREN', label: 'WARREN' },
  { value: 'VTC', label: 'VTC' },
  { value: 'CARGO', label: 'CARGO' },
  { value: 'NLOOTTO', label: "N'LOOTTO" },
];

export const fleetCategoryLabel = (value: string | null | undefined): string => {
  if (!value) return '—';
  const found = FLEET_CATEGORIES.find((c) => c.value === value);
  return found?.label ?? value;
};

export const isValidFleetCategory = (value: unknown): value is FleetCategory =>
  typeof value === 'string' && FLEET_CATEGORIES.some((c) => c.value === value);
