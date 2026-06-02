import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Top-of-screen banner shown when a dynamic import fails (stale chunk URL
 * after a deploy / HMR rebuild). Listens for the 'lovable:chunk-error'
 * window event dispatched by lazyWithRetry / ChunkErrorBoundary.
 */
export function ChunkUpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onErr = () => setVisible(true);
    window.addEventListener('lovable:chunk-error', onErr);

    // Also catch unhandled promise rejections from dynamic imports.
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message ?? e.reason ?? '');
      if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
        setVisible(true);
      }
    };
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('lovable:chunk-error', onErr);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!visible) return null;

  const reload = () => {
    try {
      sessionStorage.removeItem('lovable:chunk-reload');
    } catch {
      /* noop */
    }
    window.location.reload();
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-warning text-warning-foreground shadow-md">
      <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
        <RefreshCw className="w-4 h-4 shrink-0" />
        <span className="flex-1">
          Une nouvelle version est disponible. Rechargez la page pour continuer.
        </span>
        <Button size="sm" variant="secondary" onClick={reload} className="h-7">
          Recharger
        </Button>
        <button
          onClick={() => setVisible(false)}
          className="opacity-70 hover:opacity-100"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
