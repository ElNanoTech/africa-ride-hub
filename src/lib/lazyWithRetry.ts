import { lazy, ComponentType } from 'react';

/**
 * Wraps React.lazy with automatic recovery from stale dynamic-import URLs.
 *
 * After a new build (or a Vite HMR rebuild), the previously-fetched module
 * URL hashes change. When the user navigates to a code-split route the
 * browser tries to load the OLD URL and gets "Failed to fetch dynamically
 * imported module". This helper:
 *
 *  1. Retries the import once (transient network blip).
 *  2. If it still fails AND we haven't already reloaded for this session,
 *     sets a sessionStorage flag and triggers a single hard reload so the
 *     browser pulls the fresh `index.html` with the new chunk hashes.
 *  3. If we've already reloaded once, rethrows so the error boundary shows.
 */
const RELOAD_FLAG = 'lovable:chunk-reload';

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Successful load — clear any stale reload flag.
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isChunkError =
        /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
          msg,
        );

      if (isChunkError) {
        // Retry once for transient network issues.
        try {
          const mod = await factory();
          sessionStorage.removeItem(RELOAD_FLAG);
          return mod;
        } catch {
          // Hard-reload exactly once per session.
          if (!sessionStorage.getItem(RELOAD_FLAG)) {
            sessionStorage.setItem(RELOAD_FLAG, '1');
            window.location.reload();
            // Return a never-resolving promise so React keeps the Suspense
            // fallback visible during the reload.
            return new Promise<never>(() => {});
          }
        }
      }
      throw err;
    }
  });
}
