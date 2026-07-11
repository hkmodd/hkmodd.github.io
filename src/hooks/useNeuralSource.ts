import { useEffect, useRef, useState } from 'react';
import type { NeuralEngine } from '@/wasm/pkg/neural_engine';
import { loadInlineEngine } from '@/hooks/useNeuralEngine';
import {
  FRAME_FLOATS,
  POS_OFF,
  OPAC_OFF,
  SIZE_OFF,
  CONN_POS_OFF,
  CONN_COL_OFF,
  PULSE_OFF,
  type FrameInputs,
  type ToWorker,
  type FromWorker,
} from '@/lib/neuralProtocol';
import { getSimQuality } from '@/lib/quality';

/* ═══════════════════════════════════════════════════════════════════
   useNeuralSource — one façade over two execution backends.

   • WORKER (primary): the Rust/WASM simulation runs in a Web Worker. Two
     ArrayBuffers ping-pong between threads via `transfer` (zero-copy). The
     main thread only reads the freshest packed buffer and uploads to GPU.
   • INLINE (fallback): if the worker or WASM can't start, the engine loads
     on the main thread and ticks in `update()` — the previous behaviour.

   Either way `update(inputs)` returns a NeuralFrame of typed-array views
   the renderer copies into Three.js attributes. The renderer never knows
   which backend produced them.
   ═══════════════════════════════════════════════════════════════════ */

export interface NeuralFrame {
  positions: Float32Array; // POS_LEN
  opacities: Float32Array; // OPAC_LEN
  sizes: Float32Array; // SIZE_LEN
  connPositions: Float32Array; // CONN_POS_LEN (only [0, connCount*6) valid)
  connColors: Float32Array; // CONN_COL_LEN
  pulseMatrices: Float32Array; // PULSE_LEN
  connCount: number;
  colorR: number;
  colorG: number;
  colorB: number;
}

export interface NeuralSource {
  readonly ready: boolean;
  readonly mode: 'pending' | 'worker' | 'inline';
  update(inputs: FrameInputs): NeuralFrame | null;
  dispose(): void;
}

function createNeuralSource(onReady: () => void): NeuralSource {
  let mode: NeuralSource['mode'] = 'pending';
  let ready = false;
  const markReady = () => {
    if (!ready) {
      ready = true;
      if (import.meta.env.DEV) {
        console.log(
          `%c🧠 Neural source ready [backend: ${mode}]`,
          'color: #00d4ff; font-weight: bold',
        );
      }
      onReady();
    }
  };

  // ── Worker backend state ──────────────────────────────────────────
  let worker: Worker | null = null;
  let free: ArrayBuffer[] = [];
  let pending = false;
  let latestBuf: ArrayBuffer | null = null;
  let frame: NeuralFrame | null = null;
  let accDt = 0;
  let disposed = false;

  const q = getSimQuality();

  function buildFrame(buf: ArrayBuffer): NeuralFrame {
    const a = new Float32Array(buf);
    return {
      positions: a.subarray(POS_OFF, POS_OFF + q.nodes * 3),
      opacities: a.subarray(OPAC_OFF, OPAC_OFF + q.nodes),
      sizes: a.subarray(SIZE_OFF, SIZE_OFF + q.nodes),
      connPositions: a.subarray(CONN_POS_OFF, CONN_POS_OFF + q.maxConnections * 6),
      connColors: a.subarray(CONN_COL_OFF, CONN_COL_OFF + q.maxConnections * 6),
      pulseMatrices: a.subarray(PULSE_OFF, PULSE_OFF + q.pulses * 16),
      connCount: 0,
      colorR: 0,
      colorG: 0,
      colorB: 0,
    };
  }

  // ── Inline backend state ──────────────────────────────────────────
  let inlineEngine: NeuralEngine | null = null;
  let inlineMemory: WebAssembly.Memory | null = null;
  let inlineCache: {
    buf: ArrayBuffer;
    frame: NeuralFrame;
  } | null = null;

  function startInline() {
    if (disposed) return;
    mode = 'inline';
    loadInlineEngine()
      .then(({ engine, memory }) => {
        if (disposed) return;
        inlineEngine = engine;
        inlineMemory = memory;
        markReady();
      })
      .catch((err) => {
        // Both backends failed: leave ready=false → mesh simply not shown.
        console.warn('Neural engine unavailable (inline fallback failed):', err);
      });
  }

  function cleanupWorker() {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      worker = null;
    }
    free = [];
    pending = false;
    latestBuf = null;
    frame = null;
  }

  function startWorker() {
    if (typeof Worker === 'undefined') {
      startInline();
      return;
    }
    try {
      worker = new Worker(
        new URL('../components/canvas/neuralWorker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      startInline();
      return;
    }

    worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.type === 'ready') {
        mode = 'worker';
        free = [new ArrayBuffer(FRAME_FLOATS * 4), new ArrayBuffer(FRAME_FLOATS * 4)];
      } else if (m.type === 'frame') {
        if (disposed) return;
        if (latestBuf) free.push(latestBuf); // recycle the buffer we just finished with
        latestBuf = m.buffer;
        frame = buildFrame(m.buffer);
        pending = false;
        markReady();
      } else if (m.type === 'error') {
        cleanupWorker();
        startInline();
      }
    };
    worker.onerror = () => {
      cleanupWorker();
      startInline();
    };

    worker.postMessage({
      type: 'init',
      params: {
        nodes: q.nodes,
        maxConnections: q.maxConnections,
        pulses: q.pulses,
        connectionDist: q.connectionDist,
      },
    } as ToWorker);
  }

  startWorker();

  return {
    get ready() {
      return ready;
    },
    get mode() {
      return mode;
    },

    update(inputs: FrameInputs): NeuralFrame | null {
      if (mode === 'inline') {
        if (!inlineEngine || !inlineMemory) return null;
        const e = inlineEngine;
        e.tick(inputs.dt, inputs.px, inputs.py, inputs.pz, inputs.r, inputs.g, inputs.b, inputs.transitioning);

        const buf = inlineMemory.buffer;
        // Views into WASM memory; rebuild only when memory.grow detaches them.
        if (!inlineCache || inlineCache.buf !== buf) {
          inlineCache = {
            buf,
            frame: {
              positions: new Float32Array(buf, e.positions_ptr(), e.positions_len()),
              opacities: new Float32Array(buf, e.opacities_ptr(), e.opacities_len()),
              sizes: new Float32Array(buf, e.sizes_ptr(), e.sizes_len()),
              connPositions: new Float32Array(buf, e.conn_positions_ptr(), e.conn_positions_len()),
              connColors: new Float32Array(buf, e.conn_colors_ptr(), e.conn_colors_len()),
              pulseMatrices: new Float32Array(buf, e.pulse_matrices_ptr(), e.pulse_matrices_len()),
              connCount: 0,
              colorR: 0,
              colorG: 0,
              colorB: 0,
            },
          };
        }
        const f = inlineCache.frame;
        f.connCount = e.conn_count();
        f.colorR = e.color_r();
        f.colorG = e.color_g();
        f.colorB = e.color_b();
        return f;
      }

      // ── Worker path ──
      accDt += inputs.dt;
      if (worker && !pending && free.length > 0) {
        const buf = free.pop()!;
        const send: FrameInputs = { ...inputs, dt: accDt };
        accDt = 0;
        pending = true;
        worker.postMessage({ type: 'tick', inputs: send, buffer: buf } as ToWorker, [buf]);
      }

      if (frame && latestBuf) {
        const header = new Float32Array(latestBuf, 0, 4);
        frame.connCount = Math.round(header[0]);
        frame.colorR = header[1];
        frame.colorG = header[2];
        frame.colorB = header[3];
      }
      return frame;
    },

    dispose() {
      disposed = true;
      cleanupWorker();
    },
  };
}

/**
 * React entry point: creates one NeuralSource for the component's lifetime
 * and re-renders once when it becomes ready.
 */
export function useNeuralSource(): { source: NeuralSource | null; ready: boolean } {
  const sourceRef = useRef<NeuralSource | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const src = createNeuralSource(() => setReady(true));
    sourceRef.current = src;
    // Guard against StrictMode double-invoke seeing a stale ready.
    if (src.ready) setReady(true);
    return () => {
      src.dispose();
      sourceRef.current = null;
    };
  }, []);

  return { source: sourceRef.current, ready };
}
