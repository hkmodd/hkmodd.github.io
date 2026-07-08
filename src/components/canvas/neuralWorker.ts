/* ═══════════════════════════════════════════════════════════════════
   NEURAL WORKER — runs the Rust/WASM simulation off the main thread.

   Every frame the main thread hands us a free ArrayBuffer (transferred,
   so we own it with zero copy). We tick the engine, pack all outputs into
   that buffer, and transfer it straight back. The main thread only uploads
   the result to the GPU — the per-frame physics never touches it.

   If anything here throws, the main thread transparently falls back to the
   in-line engine, so this path can only ever be a win.
   ═══════════════════════════════════════════════════════════════════ */

import initWasm, { NeuralEngine } from '@/wasm/pkg/neural_engine';
import type { InitOutput } from '@/wasm/pkg/neural_engine';
import {
  NODE_COUNT,
  MAX_CONNECTIONS,
  PULSE_COUNT,
  CONNECTION_DIST,
  POS_OFF,
  POS_LEN,
  OPAC_OFF,
  OPAC_LEN,
  SIZE_OFF,
  SIZE_LEN,
  CONN_POS_OFF,
  CONN_COL_OFF,
  PULSE_OFF,
  PULSE_LEN,
  type ToWorker,
  type FromWorker,
} from '@/lib/neuralProtocol';

let engine: NeuralEngine | null = null;
let memory: WebAssembly.Memory | null = null;

// Cached zero-copy views into WASM linear memory. Rebuilt only when the
// backing ArrayBuffer detaches (memory.grow), mirroring the main-thread cache.
let cache: {
  buf: ArrayBuffer;
  pos: Float32Array;
  opac: Float32Array;
  size: Float32Array;
  connPos: Float32Array;
  connCol: Float32Array;
  pulse: Float32Array;
} | null = null;

function views() {
  const buf = memory!.buffer;
  if (!cache || cache.buf !== buf) {
    const e = engine!;
    cache = {
      buf,
      pos: new Float32Array(buf, e.positions_ptr(), e.positions_len()),
      opac: new Float32Array(buf, e.opacities_ptr(), e.opacities_len()),
      size: new Float32Array(buf, e.sizes_ptr(), e.sizes_len()),
      connPos: new Float32Array(buf, e.conn_positions_ptr(), e.conn_positions_len()),
      connCol: new Float32Array(buf, e.conn_colors_ptr(), e.conn_colors_len()),
      pulse: new Float32Array(buf, e.pulse_matrices_ptr(), e.pulse_matrices_len()),
    };
  }
  return cache;
}

const post = (msg: FromWorker, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? []);

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;

  if (msg.type === 'init') {
    try {
      const out: InitOutput = await initWasm();
      engine = new NeuralEngine(NODE_COUNT, MAX_CONNECTIONS, PULSE_COUNT, CONNECTION_DIST);
      memory = out.memory;
      post({ type: 'ready' });
    } catch (err) {
      post({ type: 'error', message: String(err) });
    }
    return;
  }

  if (msg.type === 'tick') {
    const out = new Float32Array(msg.buffer);
    if (!engine) {
      // Not ready yet — bounce the buffer back untouched so the pool survives.
      post({ type: 'frame', buffer: msg.buffer }, [msg.buffer]);
      return;
    }

    const i = msg.inputs;
    engine.tick(i.dt, i.px, i.py, i.pz, i.r, i.g, i.b, i.transitioning);

    const v = views();
    const connCount = engine.conn_count();
    const usedConn = connCount * 6;

    // ── Header: connCount + lerped theme colour ──
    out[0] = connCount;
    out[1] = engine.color_r();
    out[2] = engine.color_g();
    out[3] = engine.color_b();

    // ── Node blocks (small — copy in full) ──
    out.set(v.pos.subarray(0, POS_LEN), POS_OFF);
    out.set(v.opac.subarray(0, OPAC_LEN), OPAC_OFF);
    out.set(v.size.subarray(0, SIZE_LEN), SIZE_OFF);

    // ── Connections: only the active range (rest is stale, never drawn) ──
    out.set(v.connPos.subarray(0, usedConn), CONN_POS_OFF);
    out.set(v.connCol.subarray(0, usedConn), CONN_COL_OFF);

    // ── Pulses (instanced matrices — small) ──
    out.set(v.pulse.subarray(0, PULSE_LEN), PULSE_OFF);

    post({ type: 'frame', buffer: msg.buffer }, [msg.buffer]);
    return;
  }
};
