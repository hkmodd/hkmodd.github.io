import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';

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
    const forced = new URLSearchParams(window.location.search).get('neural');
    if (forced === 'gl') return false;
    if (forced === 'gpu') return true;
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

const loadGL = () => import('./NeuralMeshGL');

// Kicked off immediately at module evaluation — the engine chunk streams
// in behind the boot screen.
const enginePromise = probeWebGPU().then((ok) => (ok ? import('./NeuralMeshGPU') : loadGL()));

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

  // Nothing to warm when the background is disabled — release the boot.
  useEffect(() => {
    if (reducedMotion) useAppStore.getState().setEngineReady(true);
  }, [reducedMotion]);

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
