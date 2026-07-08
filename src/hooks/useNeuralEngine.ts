import initWasm, { NeuralEngine } from '@/wasm/pkg/neural_engine';
import type { InitOutput } from '@/wasm/pkg/neural_engine';
import {
  NODE_COUNT,
  MAX_CONNECTIONS,
  PULSE_COUNT,
  CONNECTION_DIST,
} from '@/lib/neuralProtocol';

/* ═══════════════════════════════════════════════════════════════════
   Inline WASM engine loader — the MAIN-THREAD fallback.

   The primary path runs the simulation in a Web Worker (see
   neuralWorker.ts / useNeuralSource.ts). If the worker or WASM can't be
   created there, the source falls back to loading the engine here and
   ticking it on the main thread — exactly the old behaviour, so the
   experience degrades to "previous version", never worse.
   ═══════════════════════════════════════════════════════════════════ */

export interface InlineEngine {
  engine: NeuralEngine;
  memory: WebAssembly.Memory;
}

// ── Module-level singleton ─────────────────────────────────────────
let _engine: NeuralEngine | null = null;
let _memory: WebAssembly.Memory | null = null;
let _loadPromise: Promise<InlineEngine> | null = null;

/** Load (once) and return the main-thread engine + its WASM memory. */
export function loadInlineEngine(): Promise<InlineEngine> {
  if (_engine && _memory) return Promise.resolve({ engine: _engine, memory: _memory });
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const out: InitOutput = await initWasm();
    _engine = new NeuralEngine(NODE_COUNT, MAX_CONNECTIONS, PULSE_COUNT, CONNECTION_DIST);
    _memory = out.memory;
    if (import.meta.env.DEV) {
      console.log(
        '%c🦀 WASM Neural Engine (inline fallback) loaded',
        'color: #ffb000; font-weight: bold',
        `| ${NODE_COUNT} nodes`,
      );
    }
    return { engine: _engine, memory: _memory };
  })().catch((err) => {
    _loadPromise = null; // allow retry
    throw err;
  });

  return _loadPromise;
}
