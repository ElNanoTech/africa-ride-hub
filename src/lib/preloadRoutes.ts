/**
 * Preload high-traffic route chunks shortly after the initial page settles.
 * Goal: warm the browser module cache so subsequent navigations don't depend
 * on chunk URLs that may have gone stale between sessions.
 *
 * We intentionally:
 *  - run after `requestIdleCallback` (or a short timeout fallback)
 *  - swallow errors silently — preloading is best-effort
 *  - skip when offline or on slow connections to save data
 */
type Importer = () => Promise<unknown>;

const ROUTES_TO_PRELOAD: Importer[] = [
  () => import('@/pages/Landing'),
  () => import('@/pages/driver/Login'),
  () => import('@/pages/driver/Home'),
  () => import('@/pages/driver/Journey'),
  () => import('@/pages/driver/Credit'),
  () => import('@/pages/admin/Login'),
  () => import('@/pages/admin/Dashboard'),
  () => import('@/pages/admin/CreditOperations'),
];

function shouldSkip(): boolean {
  if (typeof navigator === 'undefined') return true;
  if (!navigator.onLine) return true;
  // Save data on 2G / slow connections.
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return true;
  return false;
}

export function preloadCommonRoutes() {
  if (shouldSkip()) return;

  const run = () => {
    ROUTES_TO_PRELOAD.forEach((load) => {
      load().catch(() => {
        /* best-effort: ignore failures, lazyWithRetry handles user-facing recovery */
      });
    });
  };

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === 'function') {
    idle(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
}
