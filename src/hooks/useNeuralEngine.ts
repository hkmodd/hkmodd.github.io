import { useEffect, useRef, useState } from 'react';
import type { NeuralEngine, InitOutput } from '@/wasm/pkg/neural_engine';

/* ═══════════════════════════════════════════════════════════════════
   useNeuralEngine — singleton WASM loader
   ═══════════════════════════════════════════════════════════════════ */

// Configuration — Elegant Fluid Mode
const NODE_COUNT = 550;
const MAX_CONNECTIONS = 2500;
const PULSE_COUNT = 50;
const CONNECTION_DIST = 2.8;

export interface NeuralEngineState {
  engine: NeuralEngine | null;
  memory: WebAssembly.Memory | null;
  isReady: boolean;
}

// ── Module-level singleton ─────────────────────────────────────────
let _engine: NeuralEngine | null = null;
let _memory: WebAssembly.Memory | null = null;
let _loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (_engine) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      const wasmModule = await import('@/wasm/pkg/neural_engine');
      const initOutput: InitOutput = await wasmModule.default();

      _engine = new wasmModule.NeuralEngine(
        NODE_COUNT,
        MAX_CONNECTIONS,
        PULSE_COUNT,
        CONNECTION_DIST,
      );
      _memory = initOutput.memory;

      if (import.meta.env.DEV) {
        console.log(
          '%c🦀 WASM Flow Field Engine (v2) loaded',
          'color: #00d4ff; font-weight: bold',
          `| ${NODE_COUNT} nodes, ${MAX_CONNECTIONS} max conn, ${PULSE_COUNT} pulses`,
        );
      }
    } catch (err) {
      console.warn('WASM Neural Engine failed to load:', err);
      _loadPromise = null; // allow retry
    }
  })();

  return _loadPromise;
}

/**
 * Returns the singleton WASM NeuralEngine.
 * Multiple components can call this — they all get the same engine.
 */
export function useNeuralEngine(): NeuralEngineState {
  const [isReady, setIsReady] = useState(_engine !== null);

  useEffect(() => {
    if (_engine) {
      setIsReady(true);
      return;
    }

    let cancelled = false;

    ensureLoaded().then(() => {
      if (!cancelled) setIsReady(true);
    });

    return () => { cancelled = true; };
  }, []);

  return {
    engine: _engine,
    memory: _memory,
    isReady,
  };
}

export { NODE_COUNT, MAX_CONNECTIONS, PULSE_COUNT, CONNECTION_DIST };
