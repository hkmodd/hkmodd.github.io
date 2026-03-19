import { useEffect, useRef } from 'react';

const VERSION_KEY = 'hkmodd_app_version';
const CHECK_INTERVAL = 60_000; // 60 s

/**
 * Periodically fetches /version.json (cache-busted) and compares
 * with the locally stored version.  On mismatch → clears all
 * Service Worker caches + localStorage version, then hard-reloads.
 *
 * In development (no version.json) it silently no-ops.
 */
export function useAutoUpdate() {
  const checking = useRef(false);

  useEffect(() => {
    async function check() {
      if (checking.current) return;
      checking.current = true;

      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;           // dev or 404 → skip

        const { version } = (await res.json()) as { version: string };
        const stored = localStorage.getItem(VERSION_KEY);

        if (!stored) {
          // First visit - just store
          localStorage.setItem(VERSION_KEY, version);
          return;
        }

        if (stored !== version) {
          // Nuke all SW caches
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }

          // Unregister service workers
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }

          // Update stored version BEFORE reload so we don't loop
          localStorage.setItem(VERSION_KEY, version);

          // Hard reload (bypass browser cache)
          window.location.reload();
        }
      } catch {
        // network error → ignore silently
      } finally {
        checking.current = false;
      }
    }

    // Check on mount + every INTERVAL
    check();
    const id = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, []);
}
