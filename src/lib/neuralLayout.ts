/* ═══════════════════════════════════════════════════════════════════
   NEURAL LAYOUT — deterministic initial state for the neural mesh.

   Faithful TypeScript port of the init section of wasm/src/lib.rs
   (same splitmix32 PRNG, same seed, same depth-layer distribution), so
   the WebGPU compute path starts from the exact same universe as the
   Rust/WASM path.
   ═══════════════════════════════════════════════════════════════════ */

const FIELD_SIZE = 20.0;

const DEPTH_LAYERS = [
  { z: -8.0, fraction: 0.25, scale: 0.5, opacity: 0.3 },
  { z: -3.0, fraction: 0.45, scale: 0.8, opacity: 0.6 },
  { z: 2.0, fraction: 0.3, scale: 1.2, opacity: 1.0 },
] as const;

// ── splitmix32 (identical constants to lib.rs) ─────────────────────
function splitmix(x: number): number {
  x = (x + 0x9e3779b9) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

class Rng {
  constructor(private seed: number) {}
  next(): number {
    this.seed = splitmix(this.seed);
    return this.seed / 0xffffffff;
  }
}

export interface NeuralLayout {
  basePositions: Float32Array; // vec3 × nodeCount
  baseOpacities: Float32Array;
  baseSizes: Float32Array;
  phases: Float32Array;
  speeds: Float32Array;
  pulseFrom: Float32Array; // node indices as floats (exact < 2^24)
  pulseTo: Float32Array;
  pulseProgress: Float32Array;
  pulseSpeed: Float32Array;
}

export function createNeuralLayout(nodeCount: number, pulseCount: number): NeuralLayout {
  const rng = new Rng(42);

  const basePositions = new Float32Array(nodeCount * 3);
  const baseOpacities = new Float32Array(nodeCount);
  const baseSizes = new Float32Array(nodeCount);
  const phases = new Float32Array(nodeCount);
  const speeds = new Float32Array(nodeCount);

  let idx = 0;
  for (const layer of DEPTH_LAYERS) {
    const layerCount = Math.trunc(nodeCount * layer.fraction);
    for (let k = 0; k < layerCount; k++) {
      if (idx >= nodeCount) break;
      const i3 = idx * 3;
      basePositions[i3] = (rng.next() - 0.5) * FIELD_SIZE;
      basePositions[i3 + 1] = (rng.next() - 0.5) * FIELD_SIZE;
      basePositions[i3 + 2] = layer.z + (rng.next() - 0.5) * 4.0;
      baseOpacities[idx] = layer.opacity;
      baseSizes[idx] = layer.scale;
      phases[idx] = rng.next() * Math.PI * 2.0;
      speeds[idx] = 0.4 + rng.next() * 1.2;
      idx++;
    }
  }
  while (idx < nodeCount) {
    const i3 = idx * 3;
    basePositions[i3] = (rng.next() - 0.5) * FIELD_SIZE;
    basePositions[i3 + 1] = (rng.next() - 0.5) * FIELD_SIZE;
    basePositions[i3 + 2] = (rng.next() - 0.5) * 10.0;
    baseOpacities[idx] = 0.5;
    baseSizes[idx] = 0.7;
    phases[idx] = rng.next() * Math.PI * 2.0;
    speeds[idx] = 0.5 + rng.next() * 1.0;
    idx++;
  }

  const pulseFrom = new Float32Array(pulseCount);
  const pulseTo = new Float32Array(pulseCount);
  const pulseProgress = new Float32Array(pulseCount);
  const pulseSpeed = new Float32Array(pulseCount);
  for (let i = 0; i < pulseCount; i++) {
    pulseFrom[i] = Math.trunc(rng.next() * nodeCount) % nodeCount;
    pulseTo[i] = Math.trunc(rng.next() * nodeCount) % nodeCount;
    pulseProgress[i] = rng.next();
    pulseSpeed[i] = 0.3 + rng.next() * 0.8;
  }

  return {
    basePositions,
    baseOpacities,
    baseSizes,
    phases,
    speeds,
    pulseFrom,
    pulseTo,
    pulseProgress,
    pulseSpeed,
  };
}
