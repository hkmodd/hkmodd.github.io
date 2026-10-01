/**
 * Arredo del lungolago: lampioni, panchine, barche, bitte.
 *
 * Posizioni da `tools/garda/ground.mjs`, calcolate sulla linea d'acqua vera e
 * sui moli OSM. Qui la forma: geometria costruita in codice, colori cotti nel
 * vertice, una InstancedMesh per tipo. Le barche dondolano nello shader
 * (`propMaterial`), senza un solo aggiornamento di matrice dalla CPU.
 *
 * Tutti gli oggetti guardano verso -Z a rotazione zero: la panchina ha lo
 * schienale a +Z, la barca la prua a -Z.
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { siteToWorld } from './nav';
import { propMaterial, type Look } from './materials';

export interface PropsRaw {
  kinds: string[];
  stride: number;
  quant: { xy: number; z: number; yaw: number };
  t: number[];
}

type Vec3 = [number, number, number];

/* ── mattoni ───────────────────────────────────────────────────────────── */

function painted(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  if (flat !== geo) geo.dispose();
  flat.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = flat.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

const box = (w: number, h: number, d: number, at: Vec3, hex: string) =>
  painted(new THREE.BoxGeometry(w, h, d).translate(...at), hex);

const cylinder = (top: number, bottom: number, h: number, segments: number, at: Vec3, hex: string) =>
  painted(new THREE.CylinderGeometry(top, bottom, h, segments).translate(...at), hex);

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('[garda] merge di un oggetto d\'arredo fallito: attributi diversi');
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Scafo di un gozzo a motore da 5.4 m: sezioni a U dalla poppa (+Z) alla prua
 * (-Z), fiancata che si stringe e insella verso prua. Ogni triangolo e'
 * orientato verso l'esterno misurando la normale contro la direzione dal
 * centro della sezione: nessuna faccia dipende dal verso in cui la ho scritta.
 */
function hull(): THREE.BufferGeometry {
  const L = 5.4;
  const W = 1.95;
  const D = 0.5;
  const SECTIONS = 10;
  const white = new THREE.Color('#f1efe8');
  const stripe = new THREE.Color('#2d5f8c');
  const bottom = new THREE.Color('#c9c5bb');
  const deck = new THREE.Color('#b48d62');
  const sections: Vec3[][] = [];
  for (let k = 0; k <= SECTIONS; k++) {
    const s = k / SECTIONS; // 0 poppa, 1 prua
    const z = (0.5 - s) * L;
    const beam = s < 0.45 ? 0.86 + 0.14 * (s / 0.45) : Math.sqrt(Math.max(0, 1 - ((s - 0.45) / 0.55) ** 2));
    const w = Math.max(0.03, (W / 2) * beam);
    const sheer = 0.42 + 0.26 * Math.max(0, (s - 0.55) / 0.45) ** 2;
    const keel = -D * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, s * 1.1)));
    sections.push([
      [-w, sheer, z],
      [-w * 0.94, 0.08, z],
      [-w * 0.6, keel * 0.75, z],
      [0, keel, z],
      [w * 0.6, keel * 0.75, z],
      [w * 0.94, 0.08, z],
      [w, sheer, z],
    ]);
  }
  const positions: number[] = [];
  const colors: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const out = new THREE.Vector3();
  const tri = (p: Vec3, q: Vec3, r: Vec3, outward: THREE.Vector3, color: THREE.Color) => {
    a.set(...p);
    b.set(...q);
    c.set(...r);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const verts = n.dot(outward) >= 0 ? [p, q, r] : [p, r, q];
    for (const v of verts) {
      positions.push(...v);
      colors.push(color.r, color.g, color.b);
    }
  };
  for (let k = 0; k < SECTIONS; k++) {
    const s0 = sections[k];
    const s1 = sections[k + 1];
    for (let p = 0; p < 6; p++) {
      const mid = (s0[p][1] + s1[p + 1][1]) / 2;
      const color = p === 0 || p === 5 ? white : p === 1 || p === 4 ? stripe : bottom;
      out.set((s0[p][0] + s0[p + 1][0]) / 2, mid - s0[3][1] * 0.5, 0).normalize();
      tri(s0[p], s0[p + 1], s1[p + 1], out, color);
      tri(s0[p], s1[p + 1], s1[p], out, color);
    }
    // coperta
    out.set(0, 1, 0);
    tri(s0[0], s0[6], s1[6], out, deck);
    tri(s0[0], s1[6], s1[0], out, deck);
  }
  // specchio di poppa
  out.set(0, 0, 1);
  const stern = sections[0];
  for (let p = 1; p < 6; p++) tri(stern[3], stern[p], stern[p + 1], out, white);
  tri(stern[0], stern[3], stern[1], out, white);
  tri(stern[6], stern[5], stern[3], out, white);
  tri(stern[0], stern[6], stern[3], out, white);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

interface Kind {
  build(): THREE.BufferGeometry;
  float: boolean;
  /** Collider in coordinate locali: cilindro (raggio, altezza) o scatola (semiassi). */
  collider: { cylinder: [number, number] } | { box: Vec3 } | null;
}

const IRON = '#2a332e';

const KINDS: Record<string, Kind> = {
  lampione: {
    float: false,
    collider: { cylinder: [0.14, 4.5] },
    build: () =>
      merge([
        cylinder(0.15, 0.2, 0.45, 10, [0, 0.225, 0], IRON),
        cylinder(0.055, 0.075, 3.4, 8, [0, 2.15, 0], IRON),
        cylinder(0.1, 0.1, 0.08, 8, [0, 3.88, 0], IRON),
        box(0.32, 0.46, 0.32, [0, 4.15, 0], '#f1deb0'),
        cylinder(0.02, 0.27, 0.22, 8, [0, 4.49, 0], IRON),
        painted(new THREE.SphereGeometry(0.05, 8, 6).translate(0, 4.63, 0), IRON),
      ]),
  },
  panchina: {
    float: false,
    collider: { box: [0.9, 0.45, 0.28] },
    build: () =>
      merge([
        box(1.8, 0.07, 0.46, [0, 0.45, 0], '#8c5b3b'),
        box(1.8, 0.34, 0.05, [0, 0.74, 0.23], '#8c5b3b'),
        box(0.07, 0.45, 0.5, [-0.8, 0.225, 0.02], IRON),
        box(0.07, 0.45, 0.5, [0.8, 0.225, 0.02], IRON),
        box(0.07, 0.5, 0.05, [-0.8, 0.72, 0.25], IRON),
        box(0.07, 0.5, 0.05, [0.8, 0.72, 0.25], IRON),
      ]),
  },
  barca: {
    float: true,
    collider: null,
    build: () => {
      const cover = box(1.35, 0.42, 1.7, [0, 0.62, 0.7], '#e8e4da');
      const screen = box(1.2, 0.3, 0.06, [0, 0.95, -0.15], '#3b4d5c');
      const motor = box(0.32, 0.62, 0.34, [0, 0.5, 2.85], '#3a3d40');
      const h = hull();
      h.deleteAttribute('normal');
      const parts = [h, cover, screen, motor];
      for (const p of parts) p.deleteAttribute('normal');
      const merged = merge(parts);
      merged.computeVertexNormals();
      return merged;
    },
  },
  bitta: {
    float: false,
    collider: { cylinder: [0.13, 0.55] },
    build: () =>
      merge([cylinder(0.09, 0.12, 0.45, 10, [0, 0.225, 0], '#2d2f31'), cylinder(0.14, 0.14, 0.07, 10, [0, 0.48, 0], '#2d2f31')]),
  },
};

export interface PropCollider {
  x: number;
  y: number;
  z: number;
  yaw: number;
  shape: { cylinder: [number, number] } | { box: Vec3 };
}

export class Props {
  readonly group = new THREE.Group();
  readonly colliders: PropCollider[] = [];
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly materials: THREE.Material[] = [];
  readonly counts: Record<string, number> = {};

  constructor(raw: PropsRaw, look: Look) {
    this.group.name = 'arredo';
    const still = propMaterial(look, false);
    const afloat = propMaterial(look, true);
    this.materials.push(still, afloat);

    const byKind = new Map<string, Array<{ p: THREE.Vector3; yaw: number }>>();
    const q = raw.quant;
    for (let i = 0; i + raw.stride <= raw.t.length; i += raw.stride) {
      const name = raw.kinds[raw.t[i + 3]];
      const kind = KINDS[name];
      if (!kind) continue;
      const [x, y, z] = siteToWorld(raw.t[i] * q.xy, raw.t[i + 1] * q.xy, raw.t[i + 2] * q.z);
      const yaw = raw.t[i + 4] * q.yaw;
      const list = byKind.get(name) ?? [];
      list.push({ p: new THREE.Vector3(x, y, z), yaw });
      byKind.set(name, list);
      if (kind.collider) this.colliders.push({ x, y, z, yaw, shape: kind.collider });
    }

    const m = new THREE.Matrix4();
    const rot = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    for (const [name, items] of byKind) {
      const kind = KINDS[name];
      const mesh = new THREE.InstancedMesh(kind.build(), kind.float ? afloat : still, items.length);
      items.forEach((it, k) => {
        rot.setFromAxisAngle(up, it.yaw);
        m.compose(it.p, rot, one);
        mesh.setMatrixAt(k, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = name;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.counts[name] = items.length;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const mat of this.materials) mat.dispose();
    this.group.removeFromParent();
  }
}
