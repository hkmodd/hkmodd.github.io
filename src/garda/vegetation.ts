/**
 * Alberi di Garda.
 *
 * Posizioni da `tools/garda/ground.mjs`: alberi e filari mappati in OSM uno
 * per uno, poligoni di verde riempiti per tipo, collina a macchie. Qui la
 * forma, il disegno e il costo.
 *
 * FORMA. Nessun asset: ogni specie e' una funzione che monta un tronco e poche
 * sfere deformate. Le normali delle chiome sono RADIALI (dal centro della
 * sfera, corrette per lo schiacciamento), non per faccia: la chioma si legge
 * come un volume morbido con un lato in luce e uno in ombra, che e' come un
 * pittore semplifica un albero — e come lo fa il folio di Simon.
 *
 * COSTO. Una sola InstancedMesh per specie e per livello di dettaglio: 16
 * oggetti in tutto. La prima versione divideva per blocchi da 160 m per avere
 * il frustum culling, e produceva ~600 oggetti che il renderer moltiplica
 * per cinque passate (scena, riflesso del lago, tre cascate d'ombra).
 * Misurato: 700 ms a frame. Il costo per oggetto, a quel numero, batte di
 * gran lunga quello per triangolo. Il dettaglio si sceglie PER ALBERO: quando
 * la camera si sposta di qualche metro le matrici vengono ripartite fra la
 * mesh ricca (vicino) e quella povera (lontano), cambiando solo `count`.
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { siteToWorld } from './nav';
import { foliageMaterial, type Look } from './materials';

export interface VegRaw {
  kinds: string[];
  stride: number;
  quant: { xyz: number; scale: number };
  t: number[];
}

type Detail = 0 | 1;

interface Species {
  name: string;
  /** Raggio e altezza del tronco a scala 1: servono ai collider. */
  trunkRadius: number;
  trunkHeight: number;
  /** Foglie piatte (palma): vanno disegnate da entrambi i lati. */
  flat: boolean;
  build(detail: Detail): THREE.BufferGeometry;
}

export interface Tree {
  /** Base del tronco, coordinate mondo. */
  position: THREE.Vector3;
  species: Species;
  scale: number;
  yaw: number;
}

/** Entro questa distanza dalla camera un albero usa la geometria ricca. */
const LOD_NEAR = 170;
/** Spostamento della camera oltre il quale si ripartisce il dettaglio. */
const LOD_REPARTITION = 10;
/** Il tronco entra nel terreno: su pendio la base non deve restare sospesa. */
const SINK = 0.3;

function hash01(n: number): number {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ── mattoni ───────────────────────────────────────────────────────────── */

/** Stessi attributi per tutti i pezzi, o `mergeGeometries` rifiuta: posizione, normale, colore. */
function prepare(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  if (flat !== geo) geo.dispose();
  flat.deleteAttribute('uv');
  return flat;
}

function trunk(radius: number, height: number, color: string, detail: Detail): THREE.BufferGeometry {
  const geo = prepare(new THREE.CylinderGeometry(radius * 0.7, radius, height, detail ? 7 : 4, 1, true));
  geo.translate(0, height / 2, 0);
  const pos = geo.getAttribute('position');
  const base = new THREE.Color(color);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // al piede il tronco e' piu' scuro: terra, umidita', ombra dei rami
    const k = 0.7 + 0.3 * Math.min(1, pos.getY(i) / height);
    colors[i * 3] = base.r * k;
    colors[i * 3 + 1] = base.g * k;
    colors[i * 3 + 2] = base.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

interface Blob {
  r: number;
  /** Schiacciamento per asse. */
  s: [number, number, number];
  c: [number, number, number];
}

/**
 * Chioma: sfere deformate con normali radiali. Lo spostamento dipende dalla
 * DIREZIONE quantizzata del vertice, non dall'indice: i vertici duplicati
 * della geometria non indicizzata restano saldati.
 *
 * Prima taratura: deformazione ±13%. Sulle catture le chiome si leggevano a
 * sfaccettature piatte, perche' con 80 facce ogni triangolo spostato diventa
 * uno spigolo nella sagoma. A ±7% resta il bozzolo irregolare, non il cristallo.
 */
function crown(blobs: Blob[], top: string, bottom: string, detail: Detail, seed: number): THREE.BufferGeometry[] {
  const cTop = new THREE.Color(top);
  const cBottom = new THREE.Color(bottom);
  const minY = Math.min(...blobs.map((b) => b.c[1] - b.r * b.s[1]));
  const maxY = Math.max(...blobs.map((b) => b.c[1] + b.r * b.s[1]));
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  const col = new THREE.Color();
  return blobs.map((b, bi) => {
    const geo = prepare(new THREE.IcosahedronGeometry(1, detail));
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const normals = new Float32Array(pos.count * 3);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const key =
        (Math.round(d.x * 97) * 73856093) ^ (Math.round(d.y * 97) * 19349663) ^ (Math.round(d.z * 97) * 83492791) ^ ((seed + bi) * 2654435761);
      const bump = 1 + (hash01(key) - 0.5) * 0.14;
      const x = b.c[0] + d.x * b.r * b.s[0] * bump;
      const y = b.c[1] + d.y * b.r * b.s[1] * bump;
      const z = b.c[2] + d.z * b.r * b.s[2] * bump;
      pos.setXYZ(i, x, y, z);
      n.set(d.x / b.s[0], d.y / b.s[1], d.z / b.s[2]).normalize();
      normals[i * 3] = n.x;
      normals[i * 3 + 1] = n.y;
      normals[i * 3 + 2] = n.z;
      const t = THREE.MathUtils.clamp((y - minY) / Math.max(0.01, maxY - minY), 0, 1);
      col.copy(cBottom).lerp(cTop, t * t * (3 - 2 * t));
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  });
}

/**
 * Foglie di palma: strisce piegate a V lungo la nervatura, che ricadono.
 * Nel dettaglio ricco la larghezza alterna pieno e stretto a ogni sezione:
 * il bordo si dentella in foglioline. Prima taratura a 5 sezioni lisce: dalla
 * piazza le palme erano lame piatte da 3 m.
 */
function fronds(count: number, length: number, height: number, base: string, tip: string, detail: Detail): THREE.BufferGeometry {
  const segs = detail ? 12 : 3;
  const cBase = new THREE.Color(base);
  const cTip = new THREE.Color(tip);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const col = new THREE.Color();

  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + hash01(k * 31 + 5) * 0.45;
    const lift = 0.5 + hash01(k * 17 + 3) * 0.6;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const section = (s: number, index: number): [number, number, number][] => {
      const radial = s * length;
      const y = height + lift * 0.9 * s - 2.2 * s * s;
      const notch = detail && index % 2 === 1 ? 0.35 : 1;
      const w = (0.6 * Math.sin(Math.PI * Math.min(1, s * 1.15)) * (1 - 0.25 * s) + 0.04) * notch;
      return [
        [ca * radial - sa * w, y - w * 0.22, sa * radial + ca * w],
        [ca * radial, y, sa * radial],
        [ca * radial + sa * w, y - w * 0.22, sa * radial - ca * w],
      ];
    };
    const nx = ca * 0.3;
    const nz = sa * 0.3;
    const inv = 1 / Math.hypot(nx, 1, nz);
    for (let i = 0; i < segs; i++) {
      const s0 = i / segs;
      const s1 = (i + 1) / segs;
      const A = section(s0, i);
      const B = section(s1, i + 1);
      for (const [p, q] of [
        [0, 1],
        [1, 2],
      ]) {
        const tri = [A[p], A[q], B[q], A[p], B[q], B[p]];
        const ts = [s0, s0, s1, s0, s1, s1];
        tri.forEach((v, idx) => {
          positions.push(v[0], v[1], v[2]);
          normals.push(nx * inv, inv, nz * inv);
          col.copy(cBase).lerp(cTip, ts[idx]);
          colors.push(col.r, col.g, col.b);
        });
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('[garda] merge di una specie fallito: attributi diversi fra i pezzi');
  merged.computeBoundingSphere();
  return merged;
}

/* ── specie ────────────────────────────────────────────────────────────────
   Misure in metri a scala 1. Colori delle chiome dal basso (ombra interna)
   verso l'alto (luce di cielo). Le proporzioni vengono dalla sagoma: un
   platano del lungolago e' alto e largo, un cipresso e' una fiamma, un pino
   domestico e' un ombrello su un fusto nudo, un olivo e' basso e argentato. */

const SPECIES: Record<string, Species> = {
  latifoglia: {
    name: 'latifoglia',
    trunkRadius: 0.2,
    trunkHeight: 2.6,
    flat: false,
    build: (d) =>
      merge([
        trunk(0.2, 2.9, '#5b4a3c', d),
        ...crown(
          [
            { r: 1.9, s: [1, 0.9, 1], c: [0, 3.9, 0] },
            { r: 1.5, s: [1, 0.9, 1], c: [1.0, 3.3, 0.5] },
            { r: 1.4, s: [1, 0.9, 1], c: [-0.9, 3.5, -0.6] },
            { r: 1.2, s: [1, 0.9, 1], c: [0.2, 4.9, -0.2] },
          ],
          '#93a453',
          '#4b5c2f',
          d,
          1,
        ),
      ]),
  },
  platano: {
    name: 'platano',
    trunkRadius: 0.32,
    trunkHeight: 4,
    flat: false,
    build: (d) =>
      merge([
        trunk(0.32, 4.4, '#8b8676', d),
        ...crown(
          [
            { r: 2.8, s: [1, 0.8, 1], c: [0, 6.6, 0] },
            { r: 2.2, s: [1, 0.8, 1], c: [1.7, 5.9, 0.8] },
            { r: 2.1, s: [1, 0.8, 1], c: [-1.6, 6.1, -0.9] },
            { r: 1.9, s: [1, 0.85, 1], c: [0.4, 7.8, -0.3] },
          ],
          '#98ab5b',
          '#50633a',
          d,
          2,
        ),
      ]),
  },
  pino: {
    name: 'pino',
    trunkRadius: 0.22,
    trunkHeight: 6.4,
    flat: false,
    build: (d) =>
      merge([
        trunk(0.22, 7.0, '#6a4f3b', d),
        ...crown(
          [
            { r: 2.6, s: [1.25, 0.45, 1.25], c: [0, 7.4, 0] },
            { r: 1.8, s: [1.2, 0.45, 1.2], c: [1.5, 7.0, 0.6] },
            { r: 1.6, s: [1.2, 0.45, 1.2], c: [-1.3, 7.1, -0.8] },
          ],
          '#627846',
          '#33422a',
          d,
          3,
        ),
      ]),
  },
  cipresso: {
    name: 'cipresso',
    trunkRadius: 0.14,
    trunkHeight: 0.9,
    flat: false,
    build: (d) =>
      merge([
        trunk(0.14, 1.0, '#4a3b2f', d),
        ...crown(
          [
            { r: 1, s: [0.95, 4.3, 0.95], c: [0, 5.0, 0] },
            { r: 0.8, s: [0.9, 2.6, 0.9], c: [0.15, 3.4, 0.1] },
          ],
          '#4b6a3e',
          '#243526',
          d,
          4,
        ),
      ]),
  },
  leccio: {
    name: 'leccio',
    trunkRadius: 0.22,
    trunkHeight: 1.8,
    flat: false,
    build: (d) =>
      merge([
        trunk(0.22, 2.0, '#4e4034', d),
        ...crown(
          [
            { r: 2.3, s: [1, 0.85, 1], c: [0, 3.4, 0] },
            { r: 1.8, s: [1, 0.85, 1], c: [1.3, 2.9, 0.7] },
            { r: 1.7, s: [1, 0.85, 1], c: [-1.2, 3.0, -0.8] },
            { r: 1.5, s: [1, 0.85, 1], c: [0.3, 4.4, -0.4] },
          ],
          '#60723f',
          '#2e3b24',
          d,
          5,
        ),
      ]),
  },
  olivo: {
    name: 'olivo',
    trunkRadius: 0.2,
    trunkHeight: 1.3,
    flat: false,
    build: (d) =>
      merge([
        trunk(0.2, 1.5, '#6d6253', d),
        ...crown(
          [
            { r: 1.5, s: [1.1, 0.65, 1.1], c: [0, 2.3, 0] },
            { r: 1.2, s: [1.1, 0.65, 1.1], c: [0.9, 2.0, 0.4] },
            { r: 1.1, s: [1.1, 0.65, 1.1], c: [-0.8, 2.1, -0.5] },
          ],
          '#aab287',
          '#667055',
          d,
          6,
        ),
      ]),
  },
  palma: {
    name: 'palma',
    trunkRadius: 0.2,
    trunkHeight: 5.6,
    flat: true,
    build: (d) => merge([trunk(0.2, 6.0, '#7a6a55', d), fronds(d ? 11 : 7, 3.2, 6.0, '#5f7a37', '#94a650', d)]),
  },
  arbusto: {
    name: 'arbusto',
    trunkRadius: 0,
    trunkHeight: 0,
    flat: false,
    build: (d) =>
      merge(
        crown(
          [
            { r: 0.95, s: [1.1, 0.75, 1.1], c: [0, 0.75, 0] },
            { r: 0.75, s: [1.1, 0.75, 1.1], c: [0.6, 0.55, 0.35] },
            { r: 0.7, s: [1.1, 0.75, 1.1], c: [-0.55, 0.6, -0.3] },
          ],
          '#72854a',
          '#3d4c2b',
          d,
          7,
        ),
      ),
  },
};

/* ── la foresta ────────────────────────────────────────────────────────── */

interface Stand {
  species: Species;
  trees: Tree[];
  /** Matrici di tutti gli alberi della specie, 16 float ciascuna. */
  matrices: Float32Array;
  hi: THREE.InstancedMesh;
  lo: THREE.InstancedMesh;
}

export class Vegetation {
  readonly group = new THREE.Group();
  readonly trees: Tree[] = [];
  private readonly stands: Stand[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly lastSplit = new THREE.Vector3(Infinity, Infinity, Infinity);

  constructor(raw: VegRaw, look: Look) {
    this.group.name = 'vegetazione';
    const leaf = foliageMaterial(look, false);
    const frond = foliageMaterial(look, true);
    this.materials.push(leaf, frond);

    const q = raw.quant;
    const bySpecies = new Map<Species, Tree[]>();
    for (let i = 0, n = 0; i + raw.stride <= raw.t.length; i += raw.stride, n++) {
      const species = SPECIES[raw.kinds[raw.t[i + 3]]] ?? SPECIES.latifoglia;
      const [x, y, z] = siteToWorld(raw.t[i] * q.xyz, raw.t[i + 1] * q.xyz, raw.t[i + 2] * q.xyz - SINK);
      const tree: Tree = {
        position: new THREE.Vector3(x, y, z),
        species,
        scale: raw.t[i + 4] * q.scale,
        yaw: hash01(n * 7919 + 13) * Math.PI * 2,
      };
      this.trees.push(tree);
      const list = bySpecies.get(species);
      if (list) list.push(tree);
      else bySpecies.set(species, [tree]);
    }

    const m = new THREE.Matrix4();
    const rot = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (const [species, trees] of bySpecies) {
      const material = species.flat ? frond : leaf;
      const hi = new THREE.InstancedMesh(species.build(1), material, trees.length);
      const lo = new THREE.InstancedMesh(species.build(0), material, trees.length);
      const matrices = new Float32Array(trees.length * 16);
      trees.forEach((t, k) => {
        rot.setFromAxisAngle(up, t.yaw);
        scale.setScalar(t.scale);
        m.compose(t.position, rot, scale);
        m.toArray(matrices, k * 16);
      });
      for (const mesh of [hi, lo]) {
        mesh.instanceMatrix.array.set(matrices);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // La sfera si calcola con TUTTI gli alberi: e' un contenitore valido
        // qualunque sottoinsieme finisca poi in questa mesh.
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `${species.name}-${mesh === hi ? 'vicino' : 'lontano'}`;
        this.group.add(mesh);
      }
      hi.count = 0;
      hi.visible = false;
      this.stands.push({ species, trees, matrices, hi, lo });
    }
  }

  /**
   * Dettaglio per albero. Si ripartisce solo quando la camera si e' mossa di
   * `LOD_REPARTITION` metri: di corsa, circa una volta al secondo.
   */
  update(camera: THREE.Camera): void {
    const eye = camera.position;
    if (eye.distanceToSquared(this.lastSplit) < LOD_REPARTITION * LOD_REPARTITION) return;
    this.lastSplit.copy(eye);
    const near2 = LOD_NEAR * LOD_NEAR;
    for (const s of this.stands) {
      const hiArr = s.hi.instanceMatrix.array as Float32Array;
      const loArr = s.lo.instanceMatrix.array as Float32Array;
      let h = 0;
      let l = 0;
      for (let k = 0; k < s.trees.length; k++) {
        const src = s.matrices.subarray(k * 16, k * 16 + 16);
        if (s.trees[k].position.distanceToSquared(eye) < near2) hiArr.set(src, 16 * h++);
        else loArr.set(src, 16 * l++);
      }
      s.hi.count = h;
      s.lo.count = l;
      s.hi.visible = h > 0;
      s.lo.visible = l > 0;
      s.hi.instanceMatrix.needsUpdate = true;
      s.lo.instanceMatrix.needsUpdate = true;
    }
  }

  /** Tutte le istanze in entrambe le mesh: serve a precompilare gli shader di tutto. */
  showAll(): void {
    for (const s of this.stands) {
      for (const mesh of [s.hi, s.lo]) {
        mesh.count = s.trees.length;
        mesh.visible = true;
      }
    }
  }

  /** Forza la ripartizione del dettaglio al prossimo `update`. */
  invalidate(): void {
    this.lastSplit.set(Infinity, Infinity, Infinity);
  }

  /** Tronchi con base dentro un rettangolo mondo, per i collider. */
  trunksWithin(minX: number, maxX: number, minZ: number, maxZ: number) {
    const out: Array<{ x: number; y: number; z: number; radius: number; height: number }> = [];
    for (const t of this.trees) {
      const p = t.position;
      if (t.species.trunkRadius <= 0) continue;
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) continue;
      out.push({ x: p.x, y: p.y, z: p.z, radius: t.species.trunkRadius * t.scale, height: t.species.trunkHeight * t.scale });
    }
    return out;
  }

  /** Oggetti disegnabili: due per specie. */
  get drawGroups(): number {
    return this.stands.length * 2;
  }

  dispose(): void {
    for (const s of this.stands) {
      s.hi.geometry.dispose();
      s.lo.geometry.dispose();
      s.hi.dispose();
      s.lo.dispose();
    }
    for (const mat of this.materials) mat.dispose();
    this.group.removeFromParent();
  }
}
