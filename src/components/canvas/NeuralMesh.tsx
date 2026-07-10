import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   NEURAL MESH — backend selector.

   Picks the best available engine at runtime, with a strict
   never-worse-than-before guarantee:

     1. WebGPU (TSL compute, GPU-resident simulation)   — NeuralMeshGPU
     2. WebGL + Rust/WASM simulation in a Web Worker    — NeuralMeshGL
     3. WebGL + WASM inline on the main thread          — (inside GL)

   Only the chosen implementation's chunk is downloaded. If the WebGPU
   path fails for ANY reason (init, shader compile, runtime error), the
   boundary silently remounts the proven WebGL path.

   Test hooks: ?neural=gl forces the WebGL path, ?neural=gpu forces the
   TSL path (which itself falls back to three's WebGL2 backend when the
   browser has no WebGPU — used for CI/headless verification).
   ═══════════════════════════════════════════════════════════════════ */

const NeuralMeshGL = lazy(() => import('./NeuralMeshGL'));
const NeuralMeshGPU = lazy(() => import('./NeuralMeshGPU'));

let probePromise: Promise<boolean> | null = null;

function probeWebGPU(): Promise<boolean> {
  if (!probePromise) {
    probePromise = (async () => {
      try {
        const forced = new URLSearchParams(window.location.search).get('neural');
        if (forced === 'gl') return false;
        if (forced === 'gpu') return true;
        const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
        if (!gpu) return false;
        return !!(await gpu.requestAdapter());
      } catch {
        return false;
      }
    })();
  }
  return probePromise;
}

/** Catches any error in the WebGPU path and demotes to WebGL instead of
    surfacing a fault UI — the background must degrade invisibly. */
class GPUBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('WebGPU neural mesh failed — falling back to WebGL path:', error);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function NeuralMesh() {
  const [mode, setMode] = useState<'pending' | 'gpu' | 'gl'>('pending');

  useEffect(() => {
    let cancelled = false;
    probeWebGPU().then((ok) => {
      if (!cancelled) setMode(ok ? 'gpu' : 'gl');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === 'pending') return null;

  if (mode === 'gpu') {
    return (
      <GPUBoundary onFail={() => setMode('gl')}>
        <Suspense fallback={null}>
          <NeuralMeshGPU />
        </Suspense>
      </GPUBoundary>
    );
  }

  return (
    <Suspense fallback={null}>
      <NeuralMeshGL />
    </Suspense>
  );
}
