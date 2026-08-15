import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { preferWebGPU } from '@/lib/runtime';

/* ═══════════════════════════════════════════════════════════════════
   NEURAL MESH — backend selector.

   Picks the best available engine at runtime, with a strict
   never-worse-than-before guarantee:

     1. WebGPU + TSL compute        (NeuralMeshGPU)
     2. WebGL + WASM in a Worker    (NeuralMeshGL)
     3. WebGL + WASM inline         (fallback inside the GL path)

   The probe AND the winning chunk download start at MODULE LOAD — i.e.
   the moment the app shell mounts, while the boot screen is still
   typing — so pipeline warm-up overlaps the boot sequence instead of
   following it. Only the chosen implementation's chunk is downloaded.

   A GPUBoundary demotes silently to the WebGL path on any error.
   Test hooks: ?neural=gl forces WebGL, ?neural=gpu forces the TSL path.
   ═══════════════════════════════════════════════════════════════════ */

async function probeWebGPU(): Promise<boolean> {
  try {
    if (!preferWebGPU()) return false;
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

const loadGL = () => import('./NeuralMeshGL');

function preloadWinner<T>(load: () => Promise<T>): Promise<T> {
  // Vite rewrites import() to a hashed /assets/*.js URL. Stamp a
  // modulepreload for that href (winner only) then start the import.
  const m = load.toString().match(/["']([^"']+\.js[^"']*)["']/);
  if (m) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = m[1];
    document.head.appendChild(link);
  }
  return load();
}

// Kicked off immediately at module evaluation — the engine chunk streams
// in behind the boot screen. modulepreload is injected only for the winner.
const enginePromise = probeWebGPU().then((ok) =>
  ok ? preloadWinner(() => import('./NeuralMeshGPU')) : preloadWinner(loadGL),
);

const ChosenEngine = lazy(() => enginePromise);
const GLEngine = lazy(loadGL);

/** Catches any error in the chosen engine and demotes to the WebGL path
    instead of surfacing a fault UI — the background must degrade invisibly. */
class GPUBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('Neural engine failed — falling back to WebGL path:', error);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function NeuralMesh() {
  const [forcedGL, setForcedGL] = useState(false);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const reducedData = useAppStore((s) => s.reducedData);

  // Nothing to warm when the background is disabled — release the boot.
  useEffect(() => {
    if (reducedMotion || reducedData) useAppStore.getState().setEngineReady(true);
  }, [reducedMotion, reducedData]);

  if (reducedData) return null;

  if (forcedGL) {
    return (
      <Suspense fallback={null}>
        <GLEngine />
      </Suspense>
    );
  }

  return (
    <GPUBoundary onFail={() => setForcedGL(true)}>
      <Suspense fallback={null}>
        <ChosenEngine />
      </Suspense>
    </GPUBoundary>
  );
}
