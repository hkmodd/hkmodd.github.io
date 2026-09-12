/**
 * site.json  ->  public/garda/tex/suolo.png  +  public/garda/garda.veg.json
 *
 * IL SUOLO. Le catture a livello strada lo dicevano senza appello: meta'
 * dello schermo e' terreno, ed era una tinta unita. Il DEM non porta UV e non
 * sa cosa c'e' sopra; OSM si'. Qui si rasterizza OSM in una mappa di
 * composizione a 2 m per pixel che lo shader del terreno legge in coordinate
 * mondo:
 *
 *   R  lastricato   strade, piazze, e il tessuto fra le case nel nucleo denso
 *   G  verde        parchi, giardini, prati, boschi; e la campagna fuori paese
 *   B  riva         ghiaia e ciottoli dove il terreno sfiora il lago
 *
 * LA VEGETAZIONE. Tre fonti, in ordine di fiducia: alberi e filari mappati
 * uno per uno in OSM; poligoni di verde riempiti con la densita' del loro
 * tipo; la collina senza dati, con macchie guidate da rumore. Ogni albero
 * rispetta le distanze da muri e strade misurate sulla stessa mappa, quindi
 * nessun tronco esce da un tetto o sta in mezzo a una carreggiata.
 *
 * Deterministico: stessi dati, stesso file, byte per byte.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { decodePNG, encodePNG } from './png.mjs';
import { ORTO_ZONE } from './site.config.mjs';

const HERE = path.resolve(import.meta.dirname);
const site = JSON.parse(fs.readFileSync(path.join(HERE, 'cache', 'site.json'), 'utf8'));
const PUB = path.resolve(HERE, '..', '..', 'public', 'garda');

const WATER_Z = 64.15; // pelo misurato sul DTM regionale
const PX = 2; // metri per pixel
/** Zona rifinita (lungolago, moli, darsena): li' la riva e' lastricata e arredata. */
const REFINED = { x0: -540, y0: -320, x1: -60, y1: 90 };
const inRefined = (x, y) => x >= REFINED.x0 && x <= REFINED.x1 && y >= REFINED.y0 && y <= REFINED.y1;

/* ── terreno ── */

const T = site.terrain;
function terrainAt(x, y) {
  const fx = Math.min(T.nx - 1.001, Math.max(0, (x - T.x0) / T.step));
  const fy = Math.min(T.ny - 1.001, Math.max(0, (y - T.y0) / T.step));
  const ix = fx | 0;
  const iy = fy | 0;
  const tx = fx - ix;
  const ty = fy - iy;
  const r = iy * T.nx + ix;
  const a = T.z[r];
  const b = T.z[r + 1];
  const c = T.z[r + T.nx];
  const d = T.z[r + T.nx + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/* ── griglia ──
   Riga 0 = NORD (y massima), come ogni texture caricata con flipY: lo
   shader calcola v = (y - Y0) / H e la riga 0 cade a v = 1. */

const X0 = T.x0;
const Y0 = T.y0;
const X1 = T.x0 + (T.nx - 1) * T.step;
const Y1 = T.y0 + (T.ny - 1) * T.step;
const W = Math.ceil((X1 - X0) / PX);
const H = Math.ceil((Y1 - Y0) / PX);
const N = W * H;
const cx = (i) => X0 + (i + 0.5) * PX;
const cy = (j) => Y1 - (j + 0.5) * PX;
const toI = (x) => Math.floor((x - X0) / PX);
const toJ = (y) => Math.floor((Y1 - y) / PX);

/** Riempimento a scansione: pixel col centro dentro l'anello. */
function fillPolygon(ring, mask, value = 1) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of ring) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const j0 = Math.max(0, toJ(maxY));
  const j1 = Math.min(H - 1, toJ(minY));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const y = cy(j);
    xs.length = 0;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a];
      const [xb, yb] = ring[b];
      if (ya > y !== yb > y) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - X0) / PX - 0.5));
      const i1 = Math.min(W - 1, Math.floor((xs[k + 1] - X0) / PX - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * W + i] = Math.max(mask[j * W + i], value);
    }
  }
}

/** Nastro a capsula: pixel entro `half` metri dal segmento. */
function fillSegment(ax, ay, bx, by, half, mask) {
  const i0 = Math.max(0, toI(Math.min(ax, bx) - half) - 1);
  const i1 = Math.min(W - 1, toI(Math.max(ax, bx) + half) + 1);
  const j0 = Math.max(0, toJ(Math.max(ay, by) + half) - 1);
  const j1 = Math.min(H - 1, toJ(Math.min(ay, by) - half) + 1);
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  for (let j = j0; j <= j1; j++) {
    const y = cy(j);
    for (let i = i0; i <= i1; i++) {
      const x = cx(i);
      let t = len2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (ax + vx * t);
      const dy = y - (ay + vy * t);
      if (dx * dx + dy * dy <= half * half) mask[j * W + i] = 1;
    }
  }
}

/**
 * Trasformata di distanza euclidea esatta (Felzenszwalb & Huttenlocher):
 * due passate 1D, O(N). Restituisce metri dal pixel "pieno" piu' vicino.
 */
function distanceField(mask) {
  const INF = 1e20;
  const f = new Float64Array(Math.max(W, H));
  const d = new Float64Array(Math.max(W, H));
  const v = new Int32Array(Math.max(W, H));
  const z = new Float64Array(Math.max(W, H) + 1);
  const grid = new Float64Array(N);
  for (let k = 0; k < N; k++) grid[k] = mask[k] ? 0 : INF;

  const pass = (n) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };

  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) f[j] = grid[j * W + i];
    pass(H);
    for (let j = 0; j < H; j++) grid[j * W + i] = d[j];
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) f[i] = grid[j * W + i];
    pass(W);
    for (let i = 0; i < W; i++) grid[j * W + i] = d[i];
  }
  const out = new Float32Array(N);
  for (let k = 0; k < N; k++) out[k] = Math.sqrt(grid[k]) * PX;
  return out;
}

/** Media su un quadrato di lato 2r+1 pixel, via tabella delle somme. */
function boxMean(src, r) {
  const sat = new Float64Array((W + 1) * (H + 1));
  for (let j = 0; j < H; j++) {
    let row = 0;
    for (let i = 0; i < W; i++) {
      row += src[j * W + i];
      sat[(j + 1) * (W + 1) + i + 1] = sat[j * (W + 1) + i + 1] + row;
    }
  }
  const out = new Float32Array(N);
  for (let j = 0; j < H; j++) {
    const ja = Math.max(0, j - r);
    const jb = Math.min(H, j + r + 1);
    for (let i = 0; i < W; i++) {
      const ia = Math.max(0, i - r);
      const ib = Math.min(W, i + r + 1);
      const s = sat[jb * (W + 1) + ib] - sat[ja * (W + 1) + ib] - sat[jb * (W + 1) + ia] + sat[ja * (W + 1) + ia];
      out[j * W + i] = s / ((jb - ja) * (ib - ia));
    }
  }
  return out;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/* ── rasterizzazione ── */

const built = new Uint8Array(N);
for (const b of site.buildings) fillPolygon(b.ring, built);

const paved = new Uint8Array(N);
for (const r of site.roads) {
  const half = r.width * 0.5;
  for (let k = 0; k + 1 < r.pts.length; k++) {
    const [ax, ay] = r.pts[k];
    const [bx, by] = r.pts[k + 1];
    fillSegment(ax, ay, bx, by, half, paved);
  }
}
for (const s of site.squares ?? []) fillPolygon(s.ring, paved);

const GREEN_VALUE = { park: 0.85, garden: 0.9, grass: 1, meadow: 1, village_green: 1, forest: 0.7, wood: 0.7, scrub: 0.75, orchard: 0.8, vineyard: 0.65, farmland: 0.6, grassland: 1, heath: 0.8 };
const greenPoly = new Float32Array(N);
for (const g of site.green) fillPolygon(g.ring, greenPoly, GREEN_VALUE[g.kind] ?? 0.8);

const distBuilt = distanceField(built);
const distPaved = distanceField(paved);
// densita' costruita in un raggio di ~16 m: separa il nucleo dalle ville
const density = boxMean(built, 8);

/* ── linea di riva ──
   Distanza con segno dalla linea d'acqua, non soglia sulla quota. Prima:
   B = 1 dove il terreno sta sotto 65.9 m. Misurato sul plastico: dove il DEM
   oscilla fra 63.5 e 64.3 m un angolo di lago intero diventava schiuma. La
   riva e' una CURVA; la sua distanza e' la sola cosa che schiuma e ghiaia
   devono conoscere. B = 0.5 sulla riva, 1 a SHORE_M nell'entroterra, 0 al largo. */

const SHORE_M = 16;
// La darsena e' acqua anche dove il DEM non la vede: il suo anello OSM e' a
// 2 m. Stesso criterio di `build.mjs`: specchi d'acqua sotto i 20 ha.
const basin = new Uint8Array(N);
for (const w of site.water) if (w.area < 200000) fillPolygon(w.ring, basin);
// Nella zona rifinita comanda la riva dell'ortofoto (`orto.mjs`): si media la
// maschera a 0.25 m sul pixel da 2 m di questa griglia.
const ortoPath = path.join(HERE, 'cache', 'orto_mask.png');
const orto = fs.existsSync(ortoPath) ? decodePNG(fs.readFileSync(ortoPath)) : null;
const ortoWet = (x, y) => {
  if (!orto) return null;
  const u0 = Math.floor((x - PX / 2 - ORTO_ZONE.x0) / ORTO_ZONE.px);
  const v0 = Math.floor((ORTO_ZONE.y1 - (y + PX / 2)) / ORTO_ZONE.px);
  const span = Math.round(PX / ORTO_ZONE.px);
  if (u0 < 0 || v0 < 0 || u0 + span > orto.width || v0 + span > orto.height) return null;
  let wet = 0;
  for (let dv = 0; dv < span; dv++) for (let du = 0; du < span; du++) wet += orto.rgb[((v0 + dv) * orto.width + u0 + du) * 3] > 127 ? 1 : 0;
  return wet * 2 > span * span;
};
const land = new Uint8Array(N);
const lake = new Uint8Array(N);
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const fromPhoto = ortoWet(cx(i), cy(j));
    const wet = fromPhoto ?? (basin[k] === 1 || terrainAt(cx(i), cy(j)) <= WATER_Z);
    if (wet) lake[k] = 1;
    else land[k] = 1;
  }
}
const distToLand = distanceField(land);
const distToLake = distanceField(lake);
/** Metri dalla linea d'acqua, positivi a terra. Il bordo fra due centri di pixel sta a meta' passo. */
const signedField = new Float32Array(N);
for (let k = 0; k < N; k++) signedField[k] = land[k] ? distToLake[k] - PX / 2 : -(distToLand[k] - PX / 2);

/* ── composizione ── */

const R = new Float32Array(N);
const G = new Float32Array(N);
const B = new Float32Array(N);
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const signed = signedField[k];
    const urban = smoothstep(0.18, 0.38, density[k]);
    // lastricato: le strade vere, il tessuto fra le case nel nucleo, e un
    // marciapiede di un metro attorno a ogni edificio
    const road = paved[k] ? 1 : 1 - smoothstep(0.6, 1.8, distPaved[k]);
    const alley = urban * (1 - smoothstep(4, 11, distBuilt[k]));
    const apron = 1 - smoothstep(0.4, 1.4, distBuilt[k]);
    const r = clamp01(Math.max(road, alley, apron * 0.8));
    // verde: i poligoni, e la campagna dove il paese si dirada
    const country = (1 - smoothstep(0.05, 0.22, density[k])) * 0.75;
    const g = clamp01(Math.max(greenPoly[k], country) * (1 - r));
    const b = 0.5 + 0.5 * Math.max(-1, Math.min(1, signed / SHORE_M));
    R[k] = r;
    G[k] = g;
    B[k] = b;
  }
}

// Nella zona rifinita la riva non e' spiaggia: e' il lungolago in pietra.
// A terra, nei primi 10 m dall'acqua, lastricato pieno e niente ghiaia
// (B spinto nell'entroterra). Sull'acqua B resta com'e': la schiuma ne ha bisogno.
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const s = signedField[k];
    if (s <= 0 || s > 10 || !inRefined(cx(i), cy(j))) continue;
    R[k] = 1;
    G[k] = 0;
    B[k] = Math.max(B[k], 0.72);
  }
}

const rgb = new Uint8Array(N * 3);
const blurR = boxMean(R, 1);
const blurG = boxMean(G, 1);
// La riva a 2 m per pixel, sfumata di piu': con un solo passaggio la schiuma
// usciva a lastre bianche a gradini (misurato a livello strada).
const blurB = boxMean(boxMean(B, 2), 2);
for (let k = 0; k < N; k++) {
  rgb[k * 3] = Math.round(blurR[k] * 255);
  rgb[k * 3 + 1] = Math.round(blurG[k] * 255);
  rgb[k * 3 + 2] = Math.round(blurB[k] * 255);
}
fs.mkdirSync(path.join(PUB, 'tex'), { recursive: true });
const suoloPng = encodePNG(rgb, W, H, 3);
fs.writeFileSync(path.join(PUB, 'tex', 'suolo.png'), suoloPng);

/* ── vegetazione ── */

const hash = (a, b, s) => {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function valueNoise(x, y, cell, seed) {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

/** Specie, nell'ordine del file. Il renderer ha la stessa lista. */
const KINDS = ['latifoglia', 'platano', 'pino', 'cipresso', 'leccio', 'olivo', 'palma', 'arbusto'];
const K = Object.fromEntries(KINDS.map((k, i) => [k, i]));
/** Scala media e ampiezza della variazione, per specie. */
const SIZE = { latifoglia: [1, 0.25], platano: [1.25, 0.15], pino: [1.1, 0.2], cipresso: [1, 0.2], leccio: [0.95, 0.25], olivo: [0.85, 0.2], palma: [1, 0.2], arbusto: [0.9, 0.3] };

const sample = (field, x, y) => {
  const i = toI(x);
  const j = toJ(y);
  if (i < 0 || j < 0 || i >= W || j >= H) return 0;
  return field[j * W + i];
};

/** Spaziatura minima: griglia di hash a celle da 4 m. */
const OCC = 4;
const occupied = new Map();
function room(x, y, minD) {
  const gi = Math.floor(x / OCC);
  const gj = Math.floor(y / OCC);
  const reach = Math.ceil(minD / OCC);
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      const list = occupied.get(`${gi + di},${gj + dj}`);
      if (!list) continue;
      for (const [px, py] of list) if (Math.hypot(px - x, py - y) < minD) return false;
    }
  }
  return true;
}

const placed = [];
const counts = { osm: 0, filare: 0, poligoni: 0, collina: 0, giardini: 0 };
function plant(x, y, kind, source, { clearBuilt = 2.2, clearRoad = 1.2, minD = 3.2 } = {}) {
  if (x < X0 + 4 || x > X1 - 4 || y < Y0 + 4 || y > Y1 - 4) return false;
  const z = terrainAt(x, y);
  if (z < WATER_Z + 0.9) return false;
  if (sample(distBuilt, x, y) < clearBuilt) return false;
  if (sample(distPaved, x, y) < clearRoad) return false;
  if (!room(x, y, minD)) return false;
  const [s0, amp] = SIZE[kind];
  const n = placed.length;
  const scale = s0 * (1 + (hash(Math.round(x * 10), Math.round(y * 10), 71) - 0.5) * 2 * amp);
  placed.push([x, y, z, K[kind], scale, n]);
  const key = `${Math.floor(x / OCC)},${Math.floor(y / OCC)}`;
  const list = occupied.get(key);
  if (list) list.push([x, y]);
  else occupied.set(key, [[x, y]]);
  counts[source]++;
  return true;
}

const pick = (r, table) => {
  let acc = 0;
  for (const [kind, w] of table) {
    acc += w;
    if (r < acc) return kind;
  }
  return table[table.length - 1][0];
};

// 1. alberi e filari mappati: si fidano dei dati, distanze ridotte
for (const t of site.trees ?? []) {
  const kind = t.src === 'row' ? 'platano' : t.leaf === 'needleleaved' ? 'pino' : hash(Math.round(t.x), Math.round(t.y), 3) < 0.2 ? 'palma' : 'latifoglia';
  plant(t.x, t.y, kind, t.src === 'row' ? 'filare' : 'osm', { clearBuilt: 1.2, clearRoad: 0, minD: 2.5 });
}

// 2. poligoni di verde, per tipo
const POLY_RULES = {
  forest: { cell: 7.5, p: 0.85, table: [['leccio', 0.55], ['pino', 0.25], ['cipresso', 0.2]] },
  wood: { cell: 7.5, p: 0.85, table: [['leccio', 0.6], ['pino', 0.2], ['cipresso', 0.2]] },
  park: { cell: 11, p: 0.5, table: [['latifoglia', 0.45], ['cipresso', 0.2], ['pino', 0.2], ['palma', 0.15]] },
  garden: { cell: 10, p: 0.45, table: [['latifoglia', 0.4], ['cipresso', 0.3], ['palma', 0.15], ['arbusto', 0.15]] },
  orchard: { cell: 6, p: 0.9, table: [['olivo', 1]] },
  scrub: { cell: 6, p: 0.6, table: [['arbusto', 0.7], ['leccio', 0.3]] },
  vineyard: { cell: 14, p: 0.15, table: [['olivo', 0.6], ['cipresso', 0.4]] },
  grass: { cell: 16, p: 0.12, table: [['latifoglia', 0.6], ['cipresso', 0.4]] },
  meadow: { cell: 16, p: 0.1, table: [['latifoglia', 0.6], ['olivo', 0.4]] },
};
const inRing = (ring, x, y) => {
  let hit = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
    const [xa, ya] = ring[a];
    const [xb, yb] = ring[b];
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) hit = !hit;
  }
  return hit;
};
for (const g of site.green) {
  const rule = POLY_RULES[g.kind];
  if (!rule) continue;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of g.ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  minX = Math.max(minX, X0);
  minY = Math.max(minY, Y0);
  maxX = Math.min(maxX, X1);
  maxY = Math.min(maxY, Y1);
  const c = rule.cell;
  for (let gy = Math.floor(minY / c); gy * c <= maxY; gy++) {
    for (let gx = Math.floor(minX / c); gx * c <= maxX; gx++) {
      if (hash(gx, gy, 11) > rule.p) continue;
      const x = (gx + 0.15 + hash(gx, gy, 12) * 0.7) * c;
      const y = (gy + 0.15 + hash(gx, gy, 13) * 0.7) * c;
      if (!inRing(g.ring, x, y)) continue;
      plant(x, y, pick(hash(gx, gy, 14), rule.table), 'poligoni', { minD: c * 0.55 });
    }
  }
}

// 3. collina e campagna senza dati: macchie, non un tappeto uniforme
const HILL = 9;
for (let gy = Math.floor(Y0 / HILL); gy * HILL <= Y1; gy++) {
  for (let gx = Math.floor(X0 / HILL); gx * HILL <= X1; gx++) {
    const x = (gx + 0.1 + hash(gx, gy, 21) * 0.8) * HILL;
    const y = (gy + 0.1 + hash(gx, gy, 22) * 0.8) * HILL;
    if (sample(density, x, y) > 0.1 || sample(greenPoly, x, y) > 0) continue;
    const z = terrainAt(x, y);
    const patch = valueNoise(x, y, 70, 5) * 0.65 + valueNoise(x, y, 23, 6) * 0.35;
    const high = z > 140;
    const p = smoothstep(0.42, 0.72, patch) * (high ? 0.85 : z > 88 ? 0.5 : 0.18);
    if (hash(gx, gy, 23) > p) continue;
    const table = high
      ? [['leccio', 0.6], ['pino', 0.25], ['cipresso', 0.15]]
      : [['olivo', 0.65], ['cipresso', 0.2], ['latifoglia', 0.15]];
    plant(x, y, pick(hash(gx, gy, 24), table), 'collina', { clearBuilt: 5, clearRoad: 2.5, minD: 5 });
  }
}

// 4. giardini fra le case, fuori dal nucleo compatto
const GARDEN = 10;
for (let gy = Math.floor(Y0 / GARDEN); gy * GARDEN <= Y1; gy++) {
  for (let gx = Math.floor(X0 / GARDEN); gx * GARDEN <= X1; gx++) {
    if (hash(gx, gy, 31) > 0.2) continue;
    const x = (gx + 0.2 + hash(gx, gy, 32) * 0.6) * GARDEN;
    const y = (gy + 0.2 + hash(gx, gy, 33) * 0.6) * GARDEN;
    const d = sample(density, x, y);
    if (d <= 0.1 || d > 0.34) continue;
    plant(x, y, pick(hash(gx, gy, 34), [['latifoglia', 0.4], ['cipresso', 0.35], ['palma', 0.15], ['arbusto', 0.1]]), 'giardini', { clearBuilt: 3.5, clearRoad: 2.5, minD: 6 });
  }
}

/* ── uscita ──
   Interi quantizzati: x, y, z a 10 cm, specie, scala in centesimi.
   La rotazione non si salva: la ricava il renderer dall'indice. */

const flat = [];
for (const [x, y, z, k, s] of placed) flat.push(Math.round(x * 10), Math.round(y * 10), Math.round(z * 10), k, Math.round(s * 100));
const veg = { kinds: KINDS, stride: 5, quant: { xyz: 0.1, scale: 0.01 }, t: flat };
const vegPath = path.join(PUB, 'garda.veg.json');
fs.writeFileSync(vegPath, JSON.stringify(veg));

const byKind = {};
for (const p of placed) byKind[KINDS[p[3]]] = (byKind[KINDS[p[3]]] ?? 0) + 1;
const vegBytes = fs.statSync(vegPath).size;
const vegZip = zlib.gzipSync(fs.readFileSync(vegPath)).length;
console.log(`suolo.png       ${W}x${H} @ ${PX} m/px  ${(suoloPng.length / 1024).toFixed(0)} KB  origine (${X0.toFixed(1)}, ${Y0.toFixed(1)})  lato ${(W * PX).toFixed(0)} x ${(H * PX).toFixed(0)} m`);
console.log(`garda.veg.json  ${placed.length} alberi  ${(vegBytes / 1024).toFixed(0)} KB (gzip ${(vegZip / 1024).toFixed(0)} KB)`);
console.log(`  per fonte   ${JSON.stringify(counts)}`);
console.log(`  per specie  ${JSON.stringify(byKind)}`);
console.log(`  poligoni verdi ${site.green.length}, piazze ${(site.squares ?? []).length}, alberi OSM ${(site.trees ?? []).length}`);

/* ── riva e arredo ────────────────────────────────────────────────────────
   Zona rifinita: Piazza Catullo, i moli, la darsena, il lungolago Regina
   Adelaide. Fuori zona niente muri di riva ne' arredo: il resto del paese e'
   sfondo. Due uscite: cache/shore.json (linea d'acqua per il muro in Blender)
   e public/garda/garda.props.json (lampioni, panchine, barche, bitte). */

const ZONE = { x0: -540, y0: -320, x1: -60, y1: 90 };
const inZone = (x, y) => x >= ZONE.x0 && x <= ZONE.x1 && y >= ZONE.y0 && y <= ZONE.y1;
const PIER_DECK = WATER_Z + 0.75; // QUAY_TOP di greybox.py: banchina, diga, pontili

// 1. linea d'acqua: marching squares sul campo con segno, soglia 0, interpolata
const segs = [];
for (let j = 1; j < H - 2; j++) {
  for (let i = 1; i < W - 2; i++) {
    if (!inZone(cx(i) + PX / 2, cy(j) - PX / 2)) continue;
    const v = [signedField[j * W + i], signedField[j * W + i + 1], signedField[(j + 1) * W + i + 1], signedField[(j + 1) * W + i]];
    const P = [[cx(i), cy(j)], [cx(i + 1), cy(j)], [cx(i + 1), cy(j + 1)], [cx(i), cy(j + 1)]];
    const cross = [];
    for (let e = 0; e < 4; e++) {
      const a = v[e];
      const b = v[(e + 1) % 4];
      if (a > 0 === b > 0) continue;
      const t = a / (a - b);
      const A = P[e];
      const Bp = P[(e + 1) % 4];
      cross.push([A[0] + (Bp[0] - A[0]) * t, A[1] + (Bp[1] - A[1]) * t]);
    }
    if (cross.length === 2) segs.push([cross[0], cross[1]]);
    else if (cross.length === 4) segs.push([cross[0], cross[1]], [cross[2], cross[3]]);
  }
}
const keyOf = (p) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}`;
const ends = new Map();
segs.forEach((s, idx) => {
  for (const p of s) {
    const k = keyOf(p);
    const list = ends.get(k);
    if (list) list.push(idx);
    else ends.set(k, [idx]);
  }
});
const usedSeg = new Uint8Array(segs.length);
const rawLines = [];
for (let s0 = 0; s0 < segs.length; s0++) {
  if (usedSeg[s0]) continue;
  usedSeg[s0] = 1;
  const line = [segs[s0][0], segs[s0][1]];
  for (const forward of [true, false]) {
    for (;;) {
      const tip = forward ? line[line.length - 1] : line[0];
      const next = (ends.get(keyOf(tip)) ?? []).find((idx) => !usedSeg[idx]);
      if (next === undefined) break;
      usedSeg[next] = 1;
      const [a, b] = segs[next];
      const other = keyOf(a) === keyOf(tip) ? b : a;
      if (forward) line.push(other);
      else line.unshift(other);
    }
  }
  rawLines.push(line);
}
const polyLength = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const chaikin = (pts) => {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
};
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}
const shoreLines = [];
for (const raw of rawLines) {
  if (polyLength(raw) < 25) continue;
  let pts = simplify(chaikin(chaikin(raw)), 0.35);
  // acqua a sinistra del verso di percorrenza
  const [ax, ay] = pts[0];
  const [bx, by] = pts[1];
  const ln = Math.hypot(bx - ax, by - ay) || 1;
  const mx = (ax + bx) / 2 - ((by - ay) / ln) * 3;
  const my = (ay + by) / 2 + ((bx - ax) / ln) * 3;
  if (sample(signedField, mx, my) > 0) pts = pts.reverse();
  shoreLines.push(pts);
}
// Con l'ortofoto la linea d'acqua viene da `orto.mjs` (0.5 m, porto
// digitalizzato) e sostituisce questa, estratta a 2 m. Senza, si scrive questa.
const shorePath = path.join(HERE, 'cache', 'shore.json');
if (orto && fs.existsSync(shorePath)) {
  shoreLines.length = 0;
  for (const l of JSON.parse(fs.readFileSync(shorePath, 'utf8')).lines) shoreLines.push(l);
} else {
  fs.writeFileSync(shorePath, JSON.stringify({ lines: shoreLines.map((l) => l.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)])) }));
}

// 2. arredo
const PROP_KINDS = ['lampione', 'panchina', 'barca', 'bitta'];
const PK = Object.fromEntries(PROP_KINDS.map((k, i) => [k, i]));
const props = [];
const addProp = (x, y, z, kind, yaw) => props.push([x, y, z, PK[kind], yaw]);
/** Direzione di sito -> rotazione Y del mondo per un oggetto che guarda verso -Z. */
const yawToward = (dx, dy) => Math.atan2(-dx, dy);
const groundZ = (x, y) => terrainAt(x, y) + (sample(distPaved, x, y) < 0.4 ? 0.3 : 0.02);

const pierSegments = [];
for (const p of site.piers ?? []) {
  const pts = p.kind === 'area' ? [...p.pts, p.pts[0]] : p.pts;
  for (let i = 0; i < pts.length - 1; i++) pierSegments.push([pts[i], pts[i + 1], p.kind === 'area' ? 0 : (p.width ?? 2.6) / 2]);
}
const segDistance = (x, y, [a, b]) => {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)) : 0;
  return Math.hypot(x - (a[0] + vx * t), y - (a[1] + vy * t));
};
const nearPier = (x, y, margin) => pierSegments.some((s) => segDistance(x, y, s) < s[2] + margin);

// lampioni e panchine lungo la riva, sul lato terra
for (const line of shoreLines) {
  let carry = 6;
  let flip = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    // acqua a sinistra: la terra sta a destra (uy, -ux)
    let d = carry;
    while (d <= len) {
      const px = ax + ux * d;
      const py = ay + uy * d;
      const bench = flip++ % 2 === 1;
      const inset = bench ? 1.5 : 2.3;
      const x = px + uy * inset;
      const y = py - ux * inset;
      if (sample(signedField, x, y) > 1 && sample(distBuilt, x, y) > 1.2 && !nearPier(x, y, 1.5)) {
        // la panchina guarda il lago: verso sinistra (-uy, ux)
        addProp(x, y, groundZ(x, y), bench ? 'panchina' : 'lampione', yawToward(-uy, ux));
      }
      d += 11;
    }
    carry = d - len;
  }
}

// barche: ormeggiate di poppa lungo la darsena e lungo i fianchi dei moli
const boats = [];
/** Acqua secondo l'ortofoto a 0.25 m; null fuori dalla zona fotografata. */
const wetPhoto = (x, y) => {
  if (!orto) return null;
  const u = Math.round((x - ORTO_ZONE.x0) / ORTO_ZONE.px);
  const v = Math.round((ORTO_ZONE.y1 - y) / ORTO_ZONE.px);
  if (u < 0 || v < 0 || u >= orto.width || v >= orto.height) return null;
  return orto.rgb[(v * orto.width + u) * 3] > 127;
};
/** Lo scafo intero in acqua: centro, prua, poppa e fianchi (5.4 x 2 m). */
const boatFits = (x, y, fx, fy) => {
  for (const [a, b] of [[0, 0], [2.7, 0], [-2.7, 0], [0, 1.05], [0, -1.05]]) {
    const px = x + fx * a - fy * b;
    const py = y + fy * a + fx * b;
    const photo = wetPhoto(px, py);
    if (photo === false || (photo === null && sample(signedField, px, py) > -1)) return false;
  }
  return boats.every(([bx, by]) => Math.hypot(bx - x, by - y) > 2.8);
};
const moor = (ax, ay, bx, by, inward, spacing, reach) => {
  const len = Math.hypot(bx - ax, by - ay);
  if (len < spacing) return;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const nx = -uy * inward;
  const ny = ux * inward;
  for (let d = spacing / 2; d < len; d += spacing) {
    const x = ax + ux * d + nx * reach;
    const y = ay + uy * d + ny * reach;
    if (!inZone(x, y) || boats.length >= 120 || !boatFits(x, y, nx, ny)) continue;
    boats.push([x, y]);
    // prua verso il largo: via dalla banchina
    addProp(x, y, WATER_Z, 'barca', yawToward(nx, ny) + (hash(Math.round(x), Math.round(y), 91) - 0.5) * 0.25);
  }
};
// Con l'ortofoto: ormeggi e strutture del porto digitalizzati (`orto.mjs`).
// I moli OSM nella zona fotografata sono schizzi a 2-7 punti e se ne vanno:
// al loro posto diga e pontile misurati, anche per le bitte.
const portoPath = path.join(HERE, 'cache', 'porto.json');
const porto = orto && fs.existsSync(portoPath) ? JSON.parse(fs.readFileSync(portoPath, 'utf8')) : null;
if (porto) {
  for (let i = pierSegments.length - 1; i >= 0; i--) {
    const [a, b] = pierSegments[i];
    if (wetPhoto((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) !== null) pierSegments.splice(i, 1);
  }
  for (const s of porto.structures) {
    for (let i = 0; i < s.pts.length - 1; i++) pierSegments.push([s.pts[i], s.pts[i + 1], s.width / 2]);
  }
  for (const m of porto.moorings) {
    for (let i = 0; i < m.pts.length - 1; i++) moor(m.pts[i][0], m.pts[i][1], m.pts[i + 1][0], m.pts[i + 1][1], m.side, 2.9, m.reach);
  }
} else {
  // Senza ortofoto: lati della darsena OSM con terra alle spalle, e fianchi dei moli.
  for (const w of site.water) {
    if (w.area > 200000) continue;
    const ring = w.ring; // CCW: l'interno sta a sinistra, la banchina a destra
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const qx = (ax + bx) / 2 + ((by - ay) / len) * 2.5;
      const qy = (ay + by) / 2 - ((bx - ax) / len) * 2.5;
      if (sample(signedField, qx, qy) <= 0) continue;
      moor(ax, ay, bx, by, 1, 3.3, 3.6);
    }
  }
  for (const [a, b, half] of pierSegments) {
    if (half === 0) continue;
    moor(a[0], a[1], b[0], b[1], 1, 3.3, half + 3.2);
    moor(a[0], a[1], b[0], b[1], -1, 3.3, half + 3.2);
  }
}

// bitte sul bordo dei moli
for (const [a, b, half] of pierSegments) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 3) continue;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const offsets = half > 0 ? [half - 0.35, -(half - 0.35)] : [-0.45];
  for (let d = 2; d < len - 1; d += 5) {
    for (const o of offsets) {
      const x = a[0] + ux * d - uy * o;
      const y = a[1] + uy * d + ux * o;
      if (inZone(x, y)) addProp(x, y, PIER_DECK, 'bitta', 0);
    }
  }
}

const propFlat = [];
for (const [x, y, z, k, yaw] of props) propFlat.push(Math.round(x * 10), Math.round(y * 10), Math.round(z * 100), k, Math.round(yaw * 1000));
const propPath = path.join(PUB, 'garda.props.json');
fs.writeFileSync(propPath, JSON.stringify({ kinds: PROP_KINDS, stride: 5, quant: { xy: 0.1, z: 0.01, yaw: 0.001 }, t: propFlat }));
const propCount = {};
for (const p of props) propCount[PROP_KINDS[p[3]]] = (propCount[PROP_KINDS[p[3]]] ?? 0) + 1;
/* ── banchina ──
   Celle da 1 m a quota di riva dove l'ortofoto dice terra e il terreno (gia'
   abbassato da build.mjs lungo l'acqua) sta sotto quella quota: e' la
   superficie vera di lungolago, diga e pontili. Righe fuse in strisce. */
// Griglia continua a 1 m, non celle: prima taratura a celle piene e il bordo
// sull'acqua usciva a gradini da un metro, visibili da terra. Qui ogni vertice
// sa se sta a terra (quota di riva) o in acqua (sotto il pelo): lo spigolo fra
// i due cade dentro il muro di riva, che corre sulla linea morbida.
let slabCells = 0;
if (orto) {
  const QUAY_TOP = WATER_Z + 0.75;
  const cols = Math.round(ORTO_ZONE.x1 - ORTO_ZONE.x0);
  const rows = Math.round(ORTO_ZONE.y1 - ORTO_ZONE.y0);
  const dryVertex = (c, r) => wetPhoto(ORTO_ZONE.x0 + c, ORTO_ZONE.y0 + r) === false;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const corners = [dryVertex(c, r), dryVertex(c + 1, r), dryVertex(c + 1, r + 1), dryVertex(c, r + 1)];
      if (!corners.some(Boolean)) continue;
      // Solo dove il terreno sta sotto la riva, su almeno un angolo: col solo
      // centro restavano celle scartate con un angolo sotto quota, e dal buco
      // si vedeva il lago (triangoli bianchi a livello strada).
      const x = ORTO_ZONE.x0 + c;
      const y = ORTO_ZONE.y0 + r;
      // Margine di 1.5 m: qui il terreno e' bilineare, la mesh di Blender e'
      // triangolata col fondale approfondito, e fra un vertice abbassato e uno
      // scavato scende sotto il pelo anche dove il bilineare dice "sopra".
      // Dove il terreno supera la banchina, la banchina resta sotto e non si vede.
      const lowest = Math.min(terrainAt(x, y), terrainAt(x + 1, y), terrainAt(x + 1, y + 1), terrainAt(x, y + 1));
      if (lowest >= QUAY_TOP + 1.5) continue;
      // Col DTM regionale (terreno vero, piu' basso) la banchina si allargava
      // per decine di metri nell'entroterra: il lungolago di Garda e' una
      // fascia di pochi metri. Oltre 15 m dall'acqua comanda il terreno.
      if (sample(signedField, x + 0.5, y + 0.5) > 15) continue;
      cells.push([c, r, corners.reduce((bits, dry, k) => bits | (dry ? 1 << k : 0), 0)]);
      slabCells++;
    }
  }
  fs.writeFileSync(path.join(HERE, 'cache', 'banchina.json'), JSON.stringify({ x0: ORTO_ZONE.x0, y0: ORTO_ZONE.y0, cells }));
}
console.log(`banchina        ${slabCells} celle da 1 m`);
console.log(`riva            ${shoreLines.length} tratti, ${shoreLines.reduce((s, l) => s + polyLength(l), 0).toFixed(0)} m  ·  arredo ${JSON.stringify(propCount)}  ·  moli ${(site.piers ?? []).length}`);
