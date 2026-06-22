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

/** Current viewport progress (0 at top → 1 after one full viewport scrolled). */
export function getScrollProgress(): number {
  return compute().progress;
}

function compute(): { progress: number; scrollY: number } {
  if (typeof window === 'undefined') return { progress: 0, scrollY: 0 };
  const scrollY = window.scrollY;
  const vh = window.innerHeight || 1;
  return { scrollY, progress: Math.min(scrollY / vh, 1) };
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
  };
}
