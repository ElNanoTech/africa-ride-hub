const DRIVER_APP_PREFIXES = [
  '/driver',
  '/vehicles',
  '/rentals',
  '/score',
  '/loans',
  '/profile',
  '/notifications',
  '/journey',
] as const;

export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function isDriverAppRoute(pathname: string): boolean {
  if (isAdminRoute(pathname)) return false;
  if (pathname === '/driver-dashboard') return true;
  return DRIVER_APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
