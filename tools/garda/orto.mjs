/**
 * Riva VERA della zona rifinita, dall'ortofoto regionale.
 *
 * Perche': misurato contro l'ortofoto 2023, la riva ricavata dall'EU-DEM
 * stava fino a 40 m nell'entroterra davanti al porto, e il poligono del lago
 * della cartografia regionale e' in scala 1:50 000 (29 vertici in 480 m, nessun
 * molo). Il bacino, la diga e i pontili esistono solo nell'immagine.
 *
 * Lago aperto, segmentato:
 *   1. candidati acqua per colore (blu oltre rosso e verde, scuro) e poca
 *      varianza locale: l'acqua e' liscia, un tetto bluastro no
 *   2. riempimento dal largo: e' lago solo cio' che e' collegato al lago
 *   3. i buchi sotto i 50 m² dentro l'acqua sono barche: tornano acqua
 *   4. maggioranza 5x5 contro il seghettato della sorgente compressa
 *
 * Porto, digitalizzato a mano sull'ortofoto (±1-2 m): il riempimento non
 * entra nei canali fra i pontili, stretti, scuri e pieni di barche. Misurato
 * sulla sovrapposizione: il bacino restava terra per due terzi.
 *
 * Uscite: cache/orto_mask.png (255 = acqua, 0.25 m), cache/shore.json (linee
 * d'acqua a 0.5 m, acqua a sinistra), cache/porto.json (strutture e ormeggi),
 * out/ref/riva_maschera.png (sovrapposizione di controllo).
 *
 * Fonte: GeoPortale ARPAV, `ortomosaico_veneto_2023_utm32_comp2` (Regione del
 * Veneto). Licenza dello strato da verificare prima di pubblicare dati derivati.
 *
 *   node orto.mjs [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ORTO_ZONE as Z, makeProjection } from './site.config.mjs';
import { decodePNG, encodePNG } from './png.mjs';

const HERE = path.resolve(import.meta.dirname);
const CACHE = path.join(HERE, 'cache');
const REF = path.join(HERE, 'out', 'ref');
fs.mkdirSync(REF, { recursive: true });
const FORCE = process.argv.includes('--force');

const W = Math.round((Z.x1 - Z.x0) / Z.px);
const H = Math.round((Z.y1 - Z.y0) / Z.px);
const N = W * H;
const toU = (x) => Math.round((x - Z.x0) / Z.px);
const toV = (y) => Math.round((Z.y1 - y) / Z.px);
const pxX = (u) => Z.x0 + (u + 0.5) * Z.px;
const pxY = (v) => Z.y1 - (v + 0.5) * Z.px;

/**
 * Porto di Garda, metri sito, letti sull'ortofoto 2023 a 0.25 m/px.
 * `basin`: specchio d'acqua interno. `structures`: terra in mezzo all'acqua,
 * con larghezza. `moorings`: dove stanno le barche, lato per lato.
 */
const HARBOUR = {
  basin: [[-367.5, -15], [-320, -80], [-325, -88], [-381, -86], [-400, -47], [-388, -28]],
  structures: [
    { name: 'diga a L', width: 6, pts: [[-406, -45], [-385, -91], [-325, -93]] },
    { name: 'pontile', width: 2.6, pts: [[-384, -40], [-342.5, -80]] },
  ],
  moorings: [
    { name: 'pontile, lato nord-est', pts: [[-384, -40], [-342.5, -80]], side: 1, reach: 4.2 },
    { name: 'pontile, lato sud-ovest', pts: [[-384, -40], [-342.5, -80]], side: -1, reach: 4.2 },
    { name: 'banchina', pts: [[-367.5, -15], [-322, -78]], side: -1, reach: 3.4 },
    { name: 'diga, lato interno', pts: [[-398, -50], [-384, -84]], side: 1, reach: 6.2 },
  ],
};

/* ── sorgente ── */

const src = path.join(CACHE, 'orto_riva.png');
if (FORCE || !fs.existsSync(src)) {
  const proj = makeProjection();
  const [south, west] = proj.inverse(Z.x0, Z.y0);
  const [north, east] = proj.inverse(Z.x1, Z.y1);
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: 'geonode:ortomosaico_veneto_2023_utm32_comp2',
    styles: '',
    srs: 'EPSG:4326',
    bbox: `${west},${south},${east},${north}`,
    width: String(W),
    height: String(H),
    format: 'image/png',
  });
  const res = await fetch(`https://gaia.arpa.veneto.it/geoserver/ows?${params}`, { headers: { 'User-Agent': 'hkmodd garda/0.2' } });
  if (!res.ok || !res.headers.get('content-type')?.startsWith('image/png')) {
    throw new Error(`ortofoto: HTTP ${res.status} ${res.headers.get('content-type')}`);
  }
  fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
}
const { width, height, rgb } = decodePNG(fs.readFileSync(src));
if (width !== W || height !== H) throw new Error(`ortofoto ${width}x${height}, attesa ${W}x${H}`);

/* ── 1. candidati per colore e varianza ── */

const lum = new Float32Array(N);
for (let i = 0; i < N; i++) lum[i] = (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3;
const candidate = new Uint8Array(N);
const R = 3;
for (let v = R; v < H - R; v++) {
  for (let u = R; u < W - R; u++) {
    const i = v * W + u;
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    if (!(b - r > 26 && b - g > 20 && lum[i] < 110)) continue;
    let sum = 0;
    let sq = 0;
    for (let dv = -R; dv <= R; dv++) {
      for (let du = -R; du <= R; du++) {
        const l = lum[i + dv * W + du];
        sum += l;
        sq += l * l;
      }
    }
    const n = (2 * R + 1) ** 2;
    if (Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) < 14) candidate[i] = 1;
  }
}

/* ── 2. riempimento dal largo ── */

const water = new Uint8Array(N);
const stack = [];
for (const [x, y] of [[-520, -300], [-520, -150], [-480, -250], [-300, -300], [-520, 0]]) {
  const i = toV(y) * W + toU(x);
  if (candidate[i]) stack.push(i);
}
if (!stack.length) throw new Error('nessun seme d\'acqua valido: soglie di colore da rivedere');
while (stack.length) {
  const i = stack.pop();
  if (water[i] || !candidate[i]) continue;
  water[i] = 1;
  const u = i % W;
  if (u > 0) stack.push(i - 1);
  if (u < W - 1) stack.push(i + 1);
  if (i >= W) stack.push(i - W);
  if (i < N - W) stack.push(i + W);
}

/* ── 3. barche: componenti non-acqua piccole e chiuse dall'acqua ── */

const MAX_BOAT_PX = Math.round(50 / (Z.px * Z.px));
const seen = new Uint8Array(N);
let boatsFilled = 0;
for (let s = 0; s < N; s++) {
  if (water[s] || seen[s]) continue;
  // Esplorazione completa, niente interruzioni: una componente troncata
  // lascerebbe pezzi di terraferma che, valutati da soli, passerebbero per barche.
  const comp = [];
  let touchesEdge = false;
  stack.push(s);
  seen[s] = 1;
  while (stack.length) {
    const i = stack.pop();
    comp.push(i);
    const u = i % W;
    const v = (i / W) | 0;
    if (u === 0 || v === 0 || u === W - 1 || v === H - 1) touchesEdge = true;
    for (const j of [u > 0 ? i - 1 : -1, u < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N || water[j] || seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  if (!touchesEdge && comp.length <= MAX_BOAT_PX) {
    for (const i of comp) water[i] = 1;
    boatsFilled++;
  }
}

/* ── 4. maggioranza 5x5 ── */

const mask = new Uint8Array(N);
for (let v = 2; v < H - 2; v++) {
  for (let u = 2; u < W - 2; u++) {
    let n = 0;
    for (let dv = -2; dv <= 2; dv++) for (let du = -2; du <= 2; du++) n += water[(v + dv) * W + u + du];
    mask[v * W + u] = n >= 13 ? 1 : 0;
  }
}
// i bordi dell'immagine seguono il pixel interno piu' vicino
for (let v = 0; v < H; v++) {
  for (let u = 0; u < W; u++) {
    if (u >= 2 && v >= 2 && u < W - 2 && v < H - 2) continue;
    mask[v * W + u] = mask[Math.min(H - 3, Math.max(2, v)) * W + Math.min(W - 3, Math.max(2, u))];
  }
}

/* ── 5. porto digitalizzato ── */

function fillRing(ring, value) {
  const vs = ring.map(([, y]) => toV(y));
  const v0 = Math.max(0, Math.min(...vs));
  const v1 = Math.min(H - 1, Math.max(...vs));
  for (let v = v0; v <= v1; v++) {
    const y = pxY(v);
    const xs = [];
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a];
      const [xb, yb] = ring[b];
      if (ya > y !== yb > y) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let u = Math.max(0, toU(xs[k])); u <= Math.min(W - 1, toU(xs[k + 1])); u++) mask[v * W + u] = value;
    }
  }
}
function fillCapsule([ax, ay], [bx, by], half, value) {
  const u0 = Math.max(0, toU(Math.min(ax, bx) - half) - 1);
  const u1 = Math.min(W - 1, toU(Math.max(ax, bx) + half) + 1);
  const v0 = Math.max(0, toV(Math.max(ay, by) + half) - 1);
  const v1 = Math.min(H - 1, toV(Math.min(ay, by) - half) + 1);
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  for (let v = v0; v <= v1; v++) {
    for (let u = u0; u <= u1; u++) {
      const x = pxX(u);
      const y = pxY(v);
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
      if (Math.hypot(x - ax - vx * t, y - ay - vy * t) <= half) mask[v * W + u] = value;
    }
  }
}
fillRing(HARBOUR.basin, 1);
for (const s of HARBOUR.structures) {
  for (let i = 0; i < s.pts.length - 1; i++) fillCapsule(s.pts[i], s.pts[i + 1], s.width / 2, 0);
}

/* ── 6. bordo morbido ──
   La maschera e' a gradini da 25 cm e il porto digitalizzato ha spigoli vivi:
   misurato a livello strada, muri e banchina seguivano il seghettato. Media
   5x5 separabile due volte (~1.2 m di raggio efficace), poi soglia a meta'. */

function boxBlur(src, r) {
  const tmp = new Float32Array(N);
  const out = new Float32Array(N);
  for (let v = 0; v < H; v++) {
    let acc = 0;
    for (let u = -r; u <= r; u++) acc += src[v * W + Math.min(W - 1, Math.max(0, u))];
    for (let u = 0; u < W; u++) {
      tmp[v * W + u] = acc / (2 * r + 1);
      acc += src[v * W + Math.min(W - 1, u + r + 1)] - src[v * W + Math.max(0, u - r)];
    }
  }
  for (let u = 0; u < W; u++) {
    let acc = 0;
    for (let v = -r; v <= r; v++) acc += tmp[Math.min(H - 1, Math.max(0, v)) * W + u];
    for (let v = 0; v < H; v++) {
      out[v * W + u] = acc / (2 * r + 1);
      acc += tmp[Math.min(H - 1, v + r + 1) * W + u] - tmp[Math.max(0, v - r) * W + u];
    }
  }
  return out;
}
// Apertura morfologica dell'acqua (erosione poi dilatazione, 2 m) e nuovo
// riempimento dal largo. Misurato a livello strada: ombre d'albero attaccate
// al lago con un collo sottile passavano per acqua e il muro di riva le
// cerchiava in mezzo al lungolago. Bacino (imboccatura ~20 m) e canali fra i
// pontili (~8 m) sono piu' larghi di 4 m e sopravvivono.
{
  const OPEN = 8; // pixel da 0.25 m
  const eroded = boxBlur(boxBlur(Float32Array.from(mask), OPEN >> 1), OPEN >> 1);
  const core = new Float32Array(N);
  for (let i = 0; i < N; i++) core[i] = eroded[i] > 0.999 ? 1 : 0;
  const dilated = boxBlur(boxBlur(core, OPEN >> 1), OPEN >> 1);
  const opened = new Uint8Array(N);
  for (let i = 0; i < N; i++) opened[i] = dilated[i] > 0.001 && mask[i] ? 1 : 0;
  mask.fill(0);
  for (const [x, y] of [[-520, -300], [-520, -150], [-300, -300], [-520, 0], [-360, -60]]) {
    const i = toV(y) * W + toU(x);
    if (opened[i]) stack.push(i);
  }
  while (stack.length) {
    const i = stack.pop();
    if (mask[i] || !opened[i]) continue;
    mask[i] = 1;
    const u = i % W;
    if (u > 0) stack.push(i - 1);
    if (u < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < N - W) stack.push(i + W);
  }
}
let soft = Float32Array.from(mask);
soft = boxBlur(boxBlur(soft, 2), 2);
for (let i = 0; i < N; i++) mask[i] = soft[i] > 0.5 ? 1 : 0;

/* ── linee d'acqua: marching squares a 0.5 m sul campo morbido ── */

const SW = W >> 1;
const SH = H >> 1;
const SP = Z.px * 2;
const coarse = new Float32Array(SW * SH);
for (let v = 0; v < SH; v++) {
  for (let u = 0; u < SW; u++) {
    const i = 2 * v * W + 2 * u;
    coarse[v * SW + u] = (soft[i] + soft[i + 1] + soft[i + W] + soft[i + W + 1]) / 4;
  }
}
const cX = (u) => Z.x0 + (u + 0.5) * SP;
const cY = (v) => Z.y1 - (v + 0.5) * SP;
const segs = [];
for (let v = 0; v < SH - 1; v++) {
  for (let u = 0; u < SW - 1; u++) {
    // soglia 0.5: positivo = terra
    const val = [0.5 - coarse[v * SW + u], 0.5 - coarse[v * SW + u + 1], 0.5 - coarse[(v + 1) * SW + u + 1], 0.5 - coarse[(v + 1) * SW + u]];
    const P = [[cX(u), cY(v)], [cX(u + 1), cY(v)], [cX(u + 1), cY(v + 1)], [cX(u), cY(v + 1)]];
    const cross = [];
    for (let e = 0; e < 4; e++) {
      const a = val[e];
      const b = val[(e + 1) % 4];
      if (a > 0 === b > 0) continue;
      const t = a / (a - b);
      cross.push([P[e][0] + (P[(e + 1) % 4][0] - P[e][0]) * t, P[e][1] + (P[(e + 1) % 4][1] - P[e][1]) * t]);
    }
    if (cross.length === 2) segs.push([cross[0], cross[1]]);
    else if (cross.length === 4) segs.push([cross[0], cross[1]], [cross[2], cross[3]]);
  }
}
const keyOf = (p) => `${Math.round(p[0] * 200)},${Math.round(p[1] * 200)}`;
const ends = new Map();
segs.forEach((s, idx) => {
  for (const p of s) {
    const k = keyOf(p);
    const list = ends.get(k);
    if (list) list.push(idx);
    else ends.set(k, [idx]);
  }
});
const used = new Uint8Array(segs.length);
const lines = [];
for (let s0 = 0; s0 < segs.length; s0++) {
  if (used[s0]) continue;
  used[s0] = 1;
  const line = [segs[s0][0], segs[s0][1]];
  for (const forward of [true, false]) {
    for (;;) {
      const tip = forward ? line[line.length - 1] : line[0];
      const next = (ends.get(keyOf(tip)) ?? []).find((idx) => !used[idx]);
      if (next === undefined) break;
      used[next] = 1;
      const [a, b] = segs[next];
      const other = keyOf(a) === keyOf(tip) ? b : a;
      if (forward) line.push(other);
      else line.unshift(other);
    }
  }
  lines.push(line);
}
const lengthOf = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
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
const wetAt = (x, y) => {
  const u = toU(x);
  const v = toV(y);
  return u >= 0 && v >= 0 && u < W && v < H && mask[v * W + u] === 1;
};
const shore = [];
for (const raw of lines) {
  if (lengthOf(raw) < 8) continue;
  // Douglas-Peucker su un anello chiuso degenera: primo e ultimo punto
  // coincidono, la corda e' nulla e la linea collassa a zero metri (misurato:
  // "3 linee, 0 m"). L'anello si spezza nel punto piu' lontano dall'inizio.
  const smooth = chaikin(raw);
  const closed = Math.hypot(smooth[0][0] - smooth[smooth.length - 1][0], smooth[0][1] - smooth[smooth.length - 1][1]) < 0.01;
  let pts;
  if (closed) {
    let far = 1;
    for (let i = 1; i < smooth.length; i++) {
      if (Math.hypot(smooth[i][0] - smooth[0][0], smooth[i][1] - smooth[0][1]) > Math.hypot(smooth[far][0] - smooth[0][0], smooth[far][1] - smooth[0][1])) far = i;
    }
    pts = [...simplify(smooth.slice(0, far + 1), 0.2).slice(0, -1), ...simplify(smooth.slice(far), 0.2)];
  } else {
    pts = simplify(smooth, 0.2);
  }
  if (pts.length < 2) continue;
  // acqua a sinistra: si prova la meta' del segmento piu' lungo, 1 m a sinistra
  let best = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) > Math.hypot(pts[best + 1][0] - pts[best][0], pts[best + 1][1] - pts[best][1])) best = i;
  }
  const [ax, ay] = pts[best];
  const [bx, by] = pts[best + 1];
  const ln = Math.hypot(bx - ax, by - ay) || 1;
  if (!wetAt((ax + bx) / 2 - ((by - ay) / ln) * 1, (ay + by) / 2 + ((bx - ax) / ln) * 1)) pts = pts.reverse();
  shore.push(pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]));
}

/* ── uscite ── */

// Riva a 0.5 m per lo shader dell'acqua: lo stesso campo morbido da cui escono
// i muri, quindi la schiuma cade al piede del muro e non 2 m piu' in la'.
// 255 = acqua piena, 0 = terra, la riva sta a 128. Riga 0 = nord.
const rivaTex = new Uint8Array(SW * SH);
for (let i = 0; i < SW * SH; i++) rivaTex[i] = Math.round(coarse[i] * 255);
const TEX = path.resolve(HERE, '..', '..', 'public', 'garda', 'tex');
fs.writeFileSync(path.join(TEX, 'riva.png'), encodePNG(rivaTex, SW, SH, 1));

const gray = new Uint8Array(N);
for (let i = 0; i < N; i++) gray[i] = mask[i] * 255;
fs.writeFileSync(path.join(CACHE, 'orto_mask.png'), encodePNG(gray, W, H, 1));
fs.writeFileSync(path.join(CACHE, 'shore.json'), JSON.stringify({ source: 'ortofoto 2023 + porto digitalizzato', lines: shore }));
fs.writeFileSync(path.join(CACHE, 'porto.json'), JSON.stringify(HARBOUR));

const overlay = new Uint8Array(rgb);
for (let v = 1; v < H - 1; v++) {
  for (let u = 1; u < W - 1; u++) {
    const i = v * W + u;
    const edge = mask[i] !== mask[i - 1] || mask[i] !== mask[i + 1] || mask[i] !== mask[i - W] || mask[i] !== mask[i + W];
    if (edge) overlay.set([255, 40, 40], i * 3);
    else if (mask[i]) {
      overlay[i * 3] *= 0.6;
      overlay[i * 3 + 1] = overlay[i * 3 + 1] * 0.6 + 70;
      overlay[i * 3 + 2] = overlay[i * 3 + 2] * 0.6 + 80;
    }
  }
}
fs.writeFileSync(path.join(REF, 'riva_maschera.png'), encodePNG(overlay, W, H, 3));

let wet = 0;
for (let i = 0; i < N; i++) wet += mask[i];
const total = shore.reduce((s, l) => s + lengthOf(l), 0);
console.log(`orto            ${W}x${H} @ ${Z.px} m  acqua ${((wet * Z.px * Z.px) / 10000).toFixed(2)} ha  barche riempite ${boatsFilled}  riva ${shore.length} linee, ${total.toFixed(0)} m`);
