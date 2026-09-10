/* ═══════════════════════════════════════════════════════════════════
   SCROLL PROGRESS — single global scroll listener.

   Hero and NeuralMesh both used to attach their OWN `scroll` listener and
   each recompute the same `scrollY / viewportHeight` progress, throttled by
   their own rAF. Two listeners, two rAFs, two copies of the same math.

   This module is the one source of truth: ONE passive scroll + resize
   listener, ONE rAF flush, broadcasting normalized viewport progress to any
   number of subscribers. Subscribers still own their own side effects
   (different opacities, transforms, thresholds) — they just stop duplicating
   the plumbing.
   ═══════════════════════════════════════════════════════════════════ */

export type ScrollListener = (progress: number, scrollY: number) => void;

const listeners = new Set<ScrollListener>();
let rafId = 0;
let scheduled = false;
let attached = false;

/* ── Viewport-height cache ──────────────────────────────────────────
   The neural mesh pulls getScrollProgress() once per rendered frame, so
   `window.innerHeight` was being read ~120x/second. That read flushes
   pending layout whenever the frame dirtied style — a forced synchronous
   layout on the hot path, for a number that only changes on resize.

   Cache it and mark it dirty from resize/orientation instead. The flag
   (rather than a re-read inside the listener) keeps this correct no matter
   which resize listener the browser dispatches first.
   ────────────────────────────────────────────────────────────────── */
let vh = 0;
let vhDirty = true;
let vhAttached = false;

function invalidateVh() {
  vhDirty = true;
}

function readVh(): number {
  if (!vhAttached) {
    vhAttached = true;
    window.addEventListener('resize', invalidateVh, { passive: true });
    window.addEventListener('orientationchange', invalidateVh, { passive: true });
    // Mobile URL-bar collapse resizes the visual viewport without a
    // window `resize` in some engines.
    window.visualViewport?.addEventListener('resize', invalidateVh, { passive: true });
  }
  if (vhDirty) {
    vh = window.innerHeight || 1;
    vhDirty = false;
  }
  return vh;
}

/** Current viewport progress (0 at top → 1 after one full viewport scrolled). */
export function getScrollProgress(): number {
  return compute().progress;
}

function compute(): { progress: number; scrollY: number } {
  if (typeof window === 'undefined') return { progress: 0, scrollY: 0 };
  const scrollY = window.scrollY;
  return { scrollY, progress: Math.min(scrollY / readVh(), 1) };
}

function flush() {
  scheduled = false;
  const { progress, scrollY } = compute();
  // Iterate a snapshot — a subscriber unsubscribing mid-flush must not mutate
  // the live set under us.
  for (const fn of [...listeners]) fn(progress, scrollY);
}

function onScroll() {
  if (scheduled) return;
  scheduled = true;
  rafId = requestAnimationFrame(flush);
}

function ensureAttached() {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // Prime the cache (and its invalidation listeners) up front.
  readVh();
}

/**
 * Subscribe to scroll/resize updates. The listener is called immediately once
 * with the current state (so subscribers don't wait for the first scroll),
 * then on every subsequent scroll frame. Returns an unsubscribe function.
 */
export function subscribeScroll(listener: ScrollListener): () => void {
  ensureAttached();
  listeners.add(listener);
  const { progress, scrollY } = compute();
  listener(progress, scrollY);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && attached && typeof window !== 'undefined') {
      attached = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafId);
      scheduled = false;
    }
  };
}
