import initWasm, { NeuralEngine } from '@/wasm/pkg/neural_engine';
import type { InitOutput } from '@/wasm/pkg/neural_engine';
import { getSimQuality } from '@/lib/quality';

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
    const q = getSimQuality();
    _engine = new NeuralEngine(q.nodes, q.maxConnections, q.pulses, q.connectionDist);
    _memory = out.memory;
    if (import.meta.env.DEV) {
      console.log(
        '%c🦀 WASM Neural Engine (inline fallback) loaded',
        'color: #ffb000; font-weight: bold',
        `| ${q.nodes} nodes`,
      );
    }
    return { engine: _engine, memory: _memory };
  })().catch((err) => {
    _loadPromise = null; // allow retry
    throw err;
  });

  return _loadPromise;
}
