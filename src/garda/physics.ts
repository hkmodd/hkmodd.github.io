/**
 * Fisica: Rapier SIMD.
 *
 * I collider sono TRIMESH costruiti dagli stessi mesh che si vedono. Prima la
 * collisione era una formula analitica che inseguiva la mesh (scarto mediano
 * misurato 2.8 cm, coda fino a 2 m sui displuvi concavi): qui non c'e' niente
 * da inseguire, il tetto su cui si cammina E' il tetto disegnato.
 *
 * Il pacchetto SIMD carica il wasm all'import, senza `init()` (letto in
 * `init.js`, vuoto). Import dinamico: il portfolio non paga i 2.2 MB di wasm.
 */
import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-simd';

export type Rapier = typeof RAPIER;

/** Passo fisso: 120 Hz tiene il personaggio fluido anche su schermi a 120 Hz. */
export const FIXED_STEP = 1 / 120;
export const GRAVITY = 17.6;

export interface Physics {
  R: Rapier;
  world: RAPIER.World;
  /** Aggiunge un mesh statico come trimesh. Restituisce i triangoli. */
  addStaticMesh(mesh: THREE.Mesh): number;
  step(): void;
  dispose(): void;
}

export async function createPhysics(): Promise<Physics> {
  const R = (await import('@dimforge/rapier3d-simd')).default;
  const world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = FIXED_STEP;

  const v = new THREE.Vector3();

  return {
    R,
    world,
    addStaticMesh(mesh) {
      mesh.updateWorldMatrix(true, false);
      const geometry = mesh.geometry;
      const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
      const vertices = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        vertices[i * 3] = v.x;
        vertices[i * 3 + 1] = v.y;
        vertices[i * 3 + 2] = v.z;
      }
      let indices: Uint32Array;
      if (geometry.index) {
        indices = Uint32Array.from(geometry.index.array as ArrayLike<number>);
      } else {
        indices = new Uint32Array(pos.count);
        for (let i = 0; i < pos.count; i++) indices[i] = i;
      }
      world.createCollider(R.ColliderDesc.trimesh(vertices, indices));
      return indices.length / 3;
    },
    step() {
      world.step();
    },
    dispose() {
      world.free();
    },
  };
}
