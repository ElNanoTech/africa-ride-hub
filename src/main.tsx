import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

const RESET_FLAG = "dam-cache-reset-v3";

const mountApp = () => {
  createRoot(document.getElementById("root")!).render(
    <HelmetProvider>
      <App />
    </HelmetProvider>,
  );
};

// Aggressive cleanup of legacy service workers AND HTTP caches.
// This was a major source of "stale build" reports on both mobile and
// desktop browsers after we switched away from PWA. Browsers (especially
// Chrome/Safari on desktop) were keeping the old index.html and old
// manifest cached, which kept loading the old hashed bundles.
const purgeLegacyCaches = async (): Promise<boolean> => {
  let didSomething = false;

  // 1. Unregister every service worker still attached to this origin.
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        didSomething = true;
        await Promise.all(
          registrations.map((registration) =>
            registration.unregister().catch(() => false),
          ),
        );
      }
    } catch {
      // Ignore — some browsers throw inside iframes.
    }
  }

  // 2. Wipe the Cache Storage API (where the SW stored HTML/JS/CSS).
  if ("caches" in window) {
    try {
      const cacheKeys = await caches.keys();
      if (cacheKeys.length > 0) {
        didSomething = true;
        await Promise.all(
          cacheKeys.map((cacheKey) =>
            caches.delete(cacheKey).catch(() => false),
          ),
        );
      }
    } catch {
      // Ignore.
    }
  }

  return didSomething;
};

purgeLegacyCaches()
  .then((didClear) => {
    if (didClear && sessionStorage.getItem(RESET_FLAG) !== "done") {
      sessionStorage.setItem(RESET_FLAG, "done");
      // Force a hard reload so the browser re-fetches index.html and the
      // freshest hashed JS/CSS bundles instead of replaying stale ones.
      window.location.reload();
      return;
    }

    mountApp();
  })
  .catch(() => {
    mountApp();
  });
