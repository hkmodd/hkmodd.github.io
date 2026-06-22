/* ═══════════════════════════════════════════════════════════════════
   Quality knobs.

   No framerate cap — the canvas renders at the display's native refresh
   for butter-smooth motion. Instead we keep each FRAME cheap and let a
   PerformanceMonitor drop the internal render resolution (dpr) only if a
   device genuinely can't sustain its refresh rate, recovering when it can.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Starting device-pixel-ratio for the background canvas: native, capped at 2.
 * (Beyond 2× the extra fragments are invisible but very expensive.)
 * PerformanceMonitor lowers this at runtime only when FPS can't keep up.
 */
export function getInitialDpr(): number {
  if (typeof window === 'undefined') return 1.5;
  return Math.min(window.devicePixelRatio || 1, 2);
}

/** Lower bound PerformanceMonitor may drop to under sustained load. */
export const MIN_DPR = 1;
