/* ═══════════════════════════════════════════════════════════════════
   Quality knobs.

   No framerate cap — the canvas renders at the display's native refresh
   for butter-smooth motion. Instead we keep each FRAME cheap and let a
   PerformanceMonitor drop the internal render resolution (dpr) only if a
   device genuinely can't sustain its refresh rate, recovering when it can.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Starting device-pixel-ratio for the background canvas: native, capped at 2
 * on desktop and 1.5 on touch devices. (Beyond 2× the extra fragments are
 * invisible but very expensive; on phones the additive-blended glow is
 * fill-rate-bound, and at mobile viewing distance 1.5× is visually
 * indistinguishable for a soft background while cutting fragment work ~44%
 * vs 2×.) PerformanceMonitor lowers this at runtime only when FPS can't
 * keep up, and never raises it above this cap.
 */
export function getInitialDpr(): number {
  if (typeof window === 'undefined') return 1.5;
  const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cap = isCoarse ? 1.5 : 2;
  return Math.min(window.devicePixelRatio || 1, cap);
}

/** Lower bound PerformanceMonitor may drop to under sustained load. */
export const MIN_DPR = 1;
