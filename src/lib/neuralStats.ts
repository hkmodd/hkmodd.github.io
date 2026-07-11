/* ═══════════════════════════════════════════════════════════════════
   NEURAL TELEMETRY — live engine stats for the diagnostic HUD.

   A single module-level mutable record. The active engine writes into it
   every frame (plain property assignments — nanoseconds); the HUD samples
   it a few times per second. Deliberately NOT reactive state: telemetry
   must never cost the thing it measures.
   ═══════════════════════════════════════════════════════════════════ */

export type EngineBackend =
  | 'boot'
  | 'webgpu'
  | 'webgpu:webgl2-fallback'
  | 'wasm-worker'
  | 'wasm-inline'
  | 'off (reduced motion)';

export interface NeuralStats {
  backend: EngineBackend;
  /** Active connection segments this frame; -1 = GPU-resident (CPU never sees it). */
  connections: number;
  /** Connection pool capacity for the active tier. */
  connCap: number;
  nodes: number;
  pulses: number;
  /** Drawing-buffer size in device px. */
  resW: number;
  resH: number;
  /** Current adaptive DPR of the background canvas. */
  dpr: number;
}

export const neuralStats: NeuralStats = {
  backend: 'boot',
  connections: 0,
  connCap: 0,
  nodes: 0,
  pulses: 0,
  resW: 0,
  resH: 0,
  dpr: 1,
};
