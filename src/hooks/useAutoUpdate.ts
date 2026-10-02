import { useEffect } from 'react';

const CHECK_INTERVAL = 60_000; // 60 s, and only while the tab is visible

/**
 * Keeps a long-lived tab from running stale code after a deploy (old hashed
 * chunks disappear from the server; a late lazy import would 404).
 *
 * The question is "is the server newer than the code THIS PAGE IS RUNNING?"
 * — `__BUILD_VERSION__` is baked into the bundle with the same id written to
 * /version.json. The old test compared against the version stored on the
 * previous visit, so every returning visitor after a deploy got a freshly
 * loaded (no-cache) page hard-reloaded a second later, lock screen and all.
 *
 * And it never reloads a page someone is looking at: a stale tab is reloaded
 * the next time it is hidden. No polling while hidden either.
 *
 * In development (no version.json) it silently no-ops.
 */
export function useAutoUpdate() {
  useEffect(() => {
    let stale = false;
    let checking = false;
    let reloading = false;

    async function reloadIfHidden() {
      if (!stale || reloading || !document.hidden) return;
      reloading = true;
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch {
        // best effort — the reload below is what matters
      }
      window.location.reload();
    }

    async function check() {
      if (checking || stale || document.hidden) return;
      checking = true;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return; // dev or 404 → skip
        const { version } = (await res.json()) as { version: string };
        if (version && version !== __BUILD_VERSION__) stale = true;
      } catch {
        // network error → ignore silently
      } finally {
        checking = false;
      }
    }

    const onVisibility = () => {
      if (document.hidden) void reloadIfHidden();
      else void check();
    };

    // First check off the critical path: the boot window belongs to the
    // engine and section chunks, not to a cache-busting poll.
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    const first = ric ? ric(() => void check(), { timeout: 8000 }) : window.setTimeout(() => void check(), 4000);
    const id = window.setInterval(() => void check(), CHECK_INTERVAL);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (ric) (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(first);
      else window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
