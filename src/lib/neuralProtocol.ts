/* ═══════════════════════════════════════════════════════════════════
   NEURAL PROTOCOL — shared contract between the main thread and the
   Web Worker that runs the Rust/WASM neural simulation.

   The worker packs every per-frame output into a SINGLE Float32Array and
   `transfer`s it to the main thread (zero-copy ownership handoff — no
   structured clone). The main thread reads it back at the offsets below,
   uploads to the GPU, and transfers the buffer back for reuse.

   Both sides import these constants so the layout can never drift.
   ═══════════════════════════════════════════════════════════════════ */

// ── Simulation sizing (was previously private to useNeuralEngine) ──
export const NODE_COUNT = 450;
export const MAX_CONNECTIONS = 2000;
export const PULSE_COUNT = 40;
export const CONNECTION_DIST = 2.8;

/* ── Packed frame layout (units = float32 slots) ──────────────────────
   [0] connCount   (integer stored as float; main rounds it)
   [1] colorR
   [2] colorG
   [3] colorB
   then the six data blocks, in order.                                   */
export const HEADER = 4;

export const POS_OFF = HEADER;
export const POS_LEN = NODE_COUNT * 3;

export const OPAC_OFF = POS_OFF + POS_LEN;
export const OPAC_LEN = NODE_COUNT;

export const SIZE_OFF = OPAC_OFF + OPAC_LEN;
export const SIZE_LEN = NODE_COUNT;

export const CONN_POS_OFF = SIZE_OFF + SIZE_LEN;
export const CONN_POS_LEN = MAX_CONNECTIONS * 6;

export const CONN_COL_OFF = CONN_POS_OFF + CONN_POS_LEN;
export const CONN_COL_LEN = MAX_CONNECTIONS * 6;

export const PULSE_OFF = CONN_COL_OFF + CONN_COL_LEN;
export const PULSE_LEN = PULSE_COUNT * 16;

/** Total float32 slots in one packed frame buffer. */
export const FRAME_FLOATS = PULSE_OFF + PULSE_LEN;

// ── Message contracts ────────────────────────────────────────────────

/** Per-frame simulation inputs sent main → worker alongside a free buffer. */
export interface FrameInputs {
  dt: number;
  px: number;
  py: number;
  pz: number;
  r: number;
  g: number;
  b: number;
  transitioning: boolean;
}

/** main → worker */
export type ToWorker =
  | { type: 'init' }
  | { type: 'tick'; inputs: FrameInputs; buffer: ArrayBuffer };

/** worker → main */
export type FromWorker =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'frame'; buffer: ArrayBuffer };
