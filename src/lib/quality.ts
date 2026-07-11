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

/* ── Simulation quality tiers ─────────────────────────────────────────
   Desktop gets the full field. Coarse-pointer devices get the same art
   at a budget their GPU can hold at native refresh: fewer nodes means
   quadratically fewer pair-checks AND less additive-glow fill, and the
   perspective grid (a full-screen fragment pass that reads as a faint
   haze on a 6" display) is dropped entirely. */

export interface SimQuality {
  nodes: number;
  maxConnections: number;
  pulses: number;
  connectionDist: number;
  /** Per-node connection budget on the GPU-compute path. */
  kPerNode: number;
  /** Render the perspective grid plane. */
  grid: boolean;
}

let _quality: SimQuality | null = null;

export function getSimQuality(): SimQuality {
  if (_quality) return _quality;
  const coarse =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  _quality = coarse
    ? { nodes: 240, maxConnections: 1100, pulses: 22, connectionDist: 2.6, kPerNode: 5, grid: false }
    : { nodes: 450, maxConnections: 2000, pulses: 40, connectionDist: 2.8, kPerNode: 6, grid: true };
  return _quality;
}
