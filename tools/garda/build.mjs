/**
 * cache/*.json (WGS84, grezzi)  ->  cache/site.json (metri locali, normalizzato).
 *
 * Qui si decide la sola cosa che OSM non contiene: l'ALTEZZA.
 * Misurato su questo box: 0 edifici su 431 hanno `height`, 23 hanno
 * `building:levels`. Una pipeline "automatica" non esiste. Il modello di
 * altezza e' quindi esplicito, deterministico e documentato qui sotto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BBOX, makeProjection } from './site.config.mjs';

const CACHE = path.resolve(import.meta.dirname, 'cache');
const read = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
const proj = makeProjection();

// Terreno: DTM regionale a 5 m campionato a 2.5 m (`dtm.mjs`) se c'e',
// altrimenti EU-DEM a 25 m. Misurato: il piede rilevato degli edifici CTRN
// dista 0.32 m dal DTM e 5.17 m da EU-DEM.
const dem = fs.existsSync(path.join(CACHE, 'dtm.json')) ? read('dtm.json') : read('dem.json');
const rawBuildings = read('buildings.json').elements;
const rawWays = read('ways.json').elements;
const rawPois = read('pois.json').elements;

/* ---------- terreno ---------- */

/** Quota bilineare in metri locali. Fuori griglia: clamp al bordo. */
function sampleZ(x, y) {
  const fx = Math.min(dem.nx - 1.001, Math.max(0, (x - dem.x0) / dem.step));
  const fy = Math.min(dem.ny - 1.001, Math.max(0, (y - dem.y0) / dem.step));
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const at = (i, j) => dem.z[j * dem.nx + i];
  return (
    at(ix, iy) * (1 - tx) * (1 - ty) +
    at(ix + 1, iy) * tx * (1 - ty) +
    at(ix, iy + 1) * (1 - tx) * ty +
    at(ix + 1, iy + 1) * tx * ty
  );
}

/* ---------- geometria ---------- */

const ringOf = (el) => {
  if (!el.geometry) return null;
  const pts = el.geometry
    .filter((g) => g && g.lat != null)
    .map((g) => proj.forward(g.lat, g.lon));
  if (pts.length > 2) {
    const [ax, ay] = pts[0];
    const [bx, by] = pts[pts.length - 1];
    if (Math.hypot(ax - bx, ay - by) < 1e-6) pts.pop();
  }
  return pts.length >= 3 ? toCCW(pts) : null;
};

/** Area con segno: positiva se il contorno gira in senso antiorario. */
const signedAreaOf = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

const areaOf = (ring) => Math.abs(signedAreaOf(ring));

/**
 * OSM non garantisce il verso di percorrenza di una way chiusa: circa meta'
 * delle sagome gira in senso orario. In Blender la faccia nata da un contorno
 * orario ha la normale rivolta IN BASSO, e `inset_region` costruisce la falda
 * lungo la normale — cioe' verso il sottosuolo. Misurato prima della
 * correzione: su 500 campioni il tetto disegnato stava fino a 5.01 m sotto
 * quello calpestabile, esattamente il doppio della salita di colmo.
 * Si normalizza QUI, una volta, invece che in tre consumatori diversi.
 */
const toCCW = (ring) => (signedAreaOf(ring) < 0 ? ring.slice().reverse() : ring);

const centroidOf = (ring) => {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a *= 0.5;
  return Math.abs(a) < 1e-9 ? ring[0] : [cx / (6 * a), cy / (6 * a)];
};

/* ---------- modello di altezza ---------- */

const LEVEL_H = 3.15; // interpiano storico gardesano
const EAVES = 0.45; // cordolo di gronda sopra l'ultimo solaio

/**
 * Falda. I coppi gardesani stanno sul 35-40% di pendenza: 21 gradi.
 * L'AGGETTO e la RIENTRANZA qui non sono decorazione — sono la superficie di
 * gioco. La stessa regola genera la mesh in Blender e la collisione nel
 * browser, quindi il tetto su cui si cammina e quello che si vede non possono
 * divergere: z = gronda + min(distanza dal bordo, rientranza) * tan(falda).
 */
const ROOF_PITCH = (21 * Math.PI) / 180;
const ROOF_TAN = Math.tan(ROOF_PITCH);
const ROOF_MAX_INSET = 6.5;   // m: oltre, il colmo diventa una terrazza piana
const ROOF_OVERHANG = 0.38;   // m di gronda a sbalzo sul filo del muro

/** Distanza dal punto al bordo del poligono. */
function edgeDistance(ring, x, y) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    const vx = bx - ax;
    const vy = by - ay;
    const len = vx * vx + vy * vy;
    let t = len > 0 ? ((x - ax) * vx + (y - ay) * vy) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + t * vx);
    const dy = y - (ay + t * vy);
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function pointInRing(ring, x, y) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Involucro convesso, catena monotona di Andrew. */
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Solidita': area del sedime / area del suo involucro convesso.
 * Sotto una certa soglia la pianta ha bracci e rientranze che `inset_region`
 * non sa offsettare: gli anelli si incrociano, la falda si auto-interseca e
 * nel render compaiono macchie nere che nemmeno `recalc_face_normals` puo'
 * raddrizzare, perche' su un solido auto-intersecato "fuori" non e' definito.
 * Quelle piante prendono un tetto PIANO — che su un palazzo o un complesso
 * e' anche la soluzione architettonicamente giusta.
 */
const SOLIDITY_MIN = 0.82;

/**
 * Raggio del cerchio inscritto, VERO: il massimo della distanza dal bordo
 * campionato sulla pianta.
 *
 * L'approssimazione 2*area/perimetro sembra ragionevole e non lo e': su un
 * rettangolo 8 x 40 m da' 6.7 m contro un raggio reale di 4 m, cioe' +67%.
 * Con quel valore l'inset di Blender collassa, il colmo esce piu' basso della
 * formula e la collisione galleggia. Misurato prima della correzione:
 * scarto mediano 1.67 m fra tetto calpestabile e tetto disegnato, p95 4.98 m.
 */
function inradiusOf(ring, area, bb) {
  const [minX, minY, maxX, maxY] = bb;
  const step = Math.max(0.35, Math.sqrt(area) / 14);
  let best = 0;
  for (let y = minY + step * 0.5; y < maxY; y += step) {
    for (let x = minX + step * 0.5; x < maxX; x += step) {
      if (!pointInRing(ring, x, y)) continue;
      const d = edgeDistance(ring, x, y);
      if (d > best) best = d;
    }
  }
  return best;
}

/** Rumore deterministico da id OSM: stessa mesh a ogni run. */
function hash01(id) {
  let h = (id ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Piani per tipologia quando OSM tace. `null` = decide la densita'. */
const LEVELS_BY_KIND = {
  church: 4,
  chapel: 3,
  hotel: 4,
  apartments: 4,
  residential: 3,
  civic: 3,
  school: 2,
  retail: 2,
  commercial: 2,
  industrial: 2,
  house: 2,
  detached: 2,
  villa: 2,
  farm: 2,
  hut: 1,
  roof: 1,
  shed: 1,
  carport: 1,
  garage: 1,
  static_caravan: 1,
  farm_auxiliary: 1,
  greenhouse: 1,
  service: 1,
  yes: null,
};

const osmBuildings = [];
for (const el of rawBuildings) {
  const ring = ringOf(el);
  if (!ring) continue;
  const area = areaOf(ring);
  if (area < 12) continue; // tettoie e rumore di mappatura
  osmBuildings.push({ id: el.id, ring, area, c: centroidOf(ring), tags: el.tags ?? {} });
}

/**
 * CTRN (`ctrn.mjs`): sagome e altezze RILEVATE per unita' volumetrica.
 * Misurato contro il modello stimato qui sotto: errore assoluto mediano
 * 2.51 m per edificio, p10 -5.1 m, p90 +4.3 m. Dove la CTRN c'e', vince.
 *
 * Si usa solo l'altezza RELATIVA (gronda - piede): il piede CTRN sta in
 * mediana 5.2 m sotto l'EU-DEM, quindi le quote assolute farebbero affondare
 * o galleggiare i volumi sul terreno che la scena disegna davvero.
 * Scartati: coperture aperte e altezze fuori da 2..40 m (c'e' un -69 m).
 */
const CTRN_ID_BASE = 5_000_000_000;
const CTRN_SKIP = /tettoia|pensilina|tendone|cimitero|manufatti/i;
const ctrnBuildings = [];
let ctrnDiscarded = 0;
if (fs.existsSync(path.join(CACHE, 'ctrn.json'))) {
  for (const f of read('ctrn.json').features) {
    const h = f.gronda - f.piede;
    if (CTRN_SKIP.test(f.uso ?? '') || !(h > 2 && h < 40)) {
      ctrnDiscarded++;
      continue;
    }
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    polys.forEach((poly, k) => {
      const pts = poly[0].map(([lon, lat]) => proj.forward(lat, lon));
      const last = pts[pts.length - 1];
      if (pts.length > 3 && Math.hypot(pts[0][0] - last[0], pts[0][1] - last[1]) < 1e-6) pts.pop();
      if (pts.length < 3) return;
      const ring = toCCW(pts);
      const area = areaOf(ring);
      if (area < 12) return;
      const uso = f.uso ?? '';
      const kind = /chiesa/i.test(uso) ? 'church' : /campanile|torrino/i.test(uso) ? 'tower' : /baracca|box|stalla/i.test(uso) ? 'shed' : 'yes';
      ctrnBuildings.push({ id: CTRN_ID_BASE + f.id * 10 + k, ring, area, c: centroidOf(ring), tags: { building: kind }, measuredHeight: h });
    });
  }
}
// Un edificio OSM resta solo dove la CTRN non ha nulla: ne' il suo centroide
// dentro un'unita' CTRN, ne' un'unita' CTRN col centroide dentro di lui.
const osmKept = osmBuildings.filter(
  (b) => !ctrnBuildings.some((c) => pointInRing(c.ring, b.c[0], b.c[1]) || pointInRing(b.ring, c.c[0], c.c[1])),
);
const buildings = [...ctrnBuildings, ...osmKept];
console.log(`ctrn             ${ctrnBuildings.length} unita' (scartate ${ctrnDiscarded}), OSM tenuti ${osmKept.length} su ${osmBuildings.length}`);

/** Densita' locale: vicini col centroide entro 40 m. Guida i piani. */
const R = 40;
for (const b of buildings) {
  let n = 0;
  for (const o of buildings) {
    if (o === b) continue;
    if (Math.hypot(o.c[0] - b.c[0], o.c[1] - b.c[1]) <= R) n++;
  }
  b.n40 = n;
}

const n40Hist = {};
for (const b of buildings) n40Hist[b.n40] = (n40Hist[b.n40] ?? 0) + 1;

for (const b of buildings) {
  const t = b.tags;
  const kind = t.building ?? 'yes';
  const tagged = Number.parseFloat(t['building:levels']);

  let levels;
  let source;
  if (Number.isFinite(tagged) && tagged > 0 && tagged < 12) {
    levels = tagged;
    source = 'osm';
  } else {
    const byKind = LEVELS_BY_KIND[kind];
    if (byKind != null) {
      levels = byKind;
      source = 'kind';
    } else {
      // `building=yes`: la morfologia del tessuto decide. Il nucleo denso
      // sale a 4 piani, la villa isolata resta a 1-2. Calibrato su n40.
      const d = 1.35 + 0.155 * b.n40 + (b.area > 90 ? 0.55 : 0);
      levels = Math.max(1, Math.min(4, Math.round(d)));
      source = 'density';
    }
  }

  const jitter = (hash01(b.id) - 0.5) * 0.7;
  b.levels = levels;
  b.heightSource = source;
  b.height = levels * LEVEL_H + EAVES + jitter;
  if (b.measuredHeight) {
    // Gronda rilevata. I piani servono solo ad allineare le finestre al solaio.
    b.height = b.measuredHeight;
    b.levels = Math.max(1, Math.round((b.measuredHeight - EAVES) / LEVEL_H));
    b.heightSource = 'ctrn';
  }

  // Appoggio: base sotto il punto piu' basso del sedime, gronda sopra il piu'
  // alto. Su pendio l'edificio si incastra invece di galleggiare.
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const [x, y] of b.ring) {
    const z = sampleZ(x, y);
    if (z < zmin) zmin = z;
    if (z > zmax) zmax = z;
  }
  b.base = zmin - 1.5;
  b.eaves = zmax + b.height;

  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [x, y] of b.ring) {
    if (x < bx0) bx0 = x;
    if (y < by0) by0 = y;
    if (x > bx1) bx1 = x;
    if (y > by1) by1 = y;
  }
  const hull = convexHull(b.ring);
  b.solidity = b.area / Math.max(1e-6, areaOf(hull));
  if (b.solidity < SOLIDITY_MIN) {
    b.inset = 0;
  } else {
    const inr = inradiusOf(b.ring, b.area, [bx0, by0, bx1, by1]);
    // 0.94: un filo sotto il raggio vero, cosi' resta un colmo piatto stretto
    // invece di una punta degenere che l'inset non sa chiudere.
    b.inset = Math.min(inr * 0.94, ROOF_MAX_INSET);
  }
  b.top = b.eaves + b.inset * ROOF_TAN;
}

/* ---------- perimetro giocabile ---------- */

/**
 * L'arena non si sceglie a occhio: e' la finestra quadrata con piu' superficie
 * costruita. Sul comune intero la stessa ricerca aveva gia' isolato il centro
 * storico (27% di copertura, 76% dei tetti con un vicino entro 6 m).
 * 1.5 km² di citta' curata a mano sono lavoro da studio; questa finestra e'
 * un decimo del lavoro e tutta l'identita' del posto.
 */
const ARENA_SIDE = 440;
function findArena(side) {
  const cell = 20;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of buildings) {
    minX = Math.min(minX, b.c[0]); maxX = Math.max(maxX, b.c[0]);
    minY = Math.min(minY, b.c[1]); maxY = Math.max(maxY, b.c[1]);
  }
  const nx = Math.ceil((maxX - minX) / cell) + 1;
  const ny = Math.ceil((maxY - minY) / cell) + 1;
  const grid = new Float64Array(nx * ny);
  for (const b of buildings) {
    const ix = Math.min(nx - 1, Math.floor((b.c[0] - minX) / cell));
    const iy = Math.min(ny - 1, Math.floor((b.c[1] - minY) / cell));
    grid[iy * nx + ix] += b.area;
  }
  const w = Math.round(side / cell);
  let best = { v: -1, ix: 0, iy: 0 };
  for (let iy = 0; iy + w <= ny; iy++) {
    for (let ix = 0; ix + w <= nx; ix++) {
      let sum = 0;
      for (let y = iy; y < iy + w; y++) for (let x = ix; x < ix + w; x++) sum += grid[y * nx + x];
      if (sum > best.v) best = { v: sum, ix, iy };
    }
  }
  return {
    x0: minX + best.ix * cell,
    y0: minY + best.iy * cell,
    x1: minX + best.ix * cell + side,
    y1: minY + best.iy * cell + side,
    built: best.v,
  };
}

const arena = findArena(ARENA_SIDE);
// Cornice: fascia di 240 m attorno all'arena. Silhouette corretta, non
// calpestabile, nessuna rifinitura.
const FRAME = 240;
for (const b of buildings) {
  const [cx, cy] = b.c;
  const inArena = cx >= arena.x0 && cx <= arena.x1 && cy >= arena.y0 && cy <= arena.y1;
  const inFrame =
    cx >= arena.x0 - FRAME && cx <= arena.x1 + FRAME &&
    cy >= arena.y0 - FRAME && cy <= arena.y1 + FRAME;
  b.zone = inArena ? 'arena' : inFrame ? 'cornice' : 'fondale';
}

/* ---------- strade, acqua, muri, verde ---------- */

const ROAD_WIDTH = {
  primary: 7,
  secondary: 6.5,
  tertiary: 6,
  unclassified: 4.5,
  residential: 5,
  living_street: 4.5,
  service: 3.5,
  pedestrian: 4.5,
  footway: 2,
  path: 1.6,
  steps: 1.8,
  track: 3,
  cycleway: 2.5,
};

/**
 * Overpass restituisce la geometria INTERA di ogni way che tocca il box:
 * una strada provinciale entra per 30 m ed esce a 2 km da qui. Senza taglio
 * il modello misura 1623 x 2699 m invece di 1015 x 1500, il bounding box va
 * a farsi benedire e i nastri drappeggiati restano sospesi nel vuoto perche'
 * il campionamento del terreno fuori griglia e' clampato al bordo.
 */
function clipPolyline(pts, x0, y0, x1, y1) {
  const inside = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  // Interseca il segmento a->b col rettangolo e restituisce il punto sul bordo.
  const boundary = (a, b) => {
    let t = 1;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const limit = (num, den) => {
      if (den === 0) return;
      const k = num / den;
      if (k >= 0 && k < t) t = k;
    };
    if (b[0] < x0) limit(x0 - a[0], dx);
    if (b[0] > x1) limit(x1 - a[0], dx);
    if (b[1] < y0) limit(y0 - a[1], dy);
    if (b[1] > y1) limit(y1 - a[1], dy);
    return [a[0] + dx * t, a[1] + dy * t];
  };

  const runs = [];
  let cur = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (inside(p)) {
      if (!cur) {
        cur = [];
        if (i > 0) cur.push(boundary(p, pts[i - 1]));
      }
      cur.push(p);
    } else if (cur) {
      cur.push(boundary(cur[cur.length - 1], p));
      if (cur.length >= 2) runs.push(cur);
      cur = null;
    }
  }
  if (cur && cur.length >= 2) runs.push(cur);
  return runs;
}

const CLIP = (() => {
  const p = makeProjection();
  const [ax, ay] = p.forward(BBOX.south, BBOX.west);
  const [bx, by] = p.forward(BBOX.north, BBOX.east);
  return [ax, ay, bx, by];
})();

const roads = [];
const walls = [];
const water = [];
const green = [];

for (const el of rawWays) {
  const t = el.tags ?? {};
  const pts = el.geometry
    ?.filter((g) => g && g.lat != null)
    .map((g) => proj.forward(g.lat, g.lon));
  if (!pts || pts.length < 2) continue;

  if (t.highway) {
    for (const run of clipPolyline(pts, ...CLIP)) {
      roads.push({ id: el.id, kind: t.highway, width: ROAD_WIDTH[t.highway] ?? 3, pts: run });
    }
  } else if (t.barrier === 'wall' || t.barrier === 'retaining_wall' || t.barrier === 'city_wall') {
    for (const run of clipPolyline(pts, ...CLIP)) {
      walls.push({ id: el.id, kind: t.barrier, pts: run });
    }
  } else if (t.natural === 'water' || t.waterway === 'riverbank') {
    const ring = ringOf(el);
    if (ring) water.push({ id: el.id, ring, area: areaOf(ring) });
  } else if (
    t.natural === 'wood' ||
    t.landuse === 'forest' ||
    t.natural === 'scrub' ||
    t.landuse === 'orchard'
  ) {
    const ring = ringOf(el);
    if (ring) green.push({ id: el.id, kind: t.natural ?? t.landuse, ring, area: areaOf(ring) });
  }
}

const pois = rawPois
  .filter((el) => el.type === 'node' && el.lat != null)
  .map((el) => {
    const [x, y] = proj.forward(el.lat, el.lon);
    return {
      id: el.id,
      x,
      y,
      z: sampleZ(x, y),
      name: el.tags?.name ?? null,
      kind: el.tags?.historic ?? el.tags?.natural ?? el.tags?.tourism ?? el.tags?.amenity ?? '?',
    };
  });

/* ---------- piazze ---------- */

/**
 * Una piazza in OSM e' `highway=pedestrian` + `area=yes` (o `place=square`).
 * Trattata come strada diventava un nastro da 4.5 m lungo il PERIMETRO, con
 * il centro della piazza lasciato a terra battuta. Qui diventa un poligono.
 */
const squares = [];
for (const el of rawWays) {
  const t = el.tags ?? {};
  const isArea = (t.highway === 'pedestrian' && t.area === 'yes') || t.place === 'square';
  if (!isArea) continue;
  const ring = ringOf(el);
  if (ring) squares.push({ id: el.id, name: t.name ?? null, surface: t.surface ?? null, ring, area: areaOf(ring) });
}
const squareIds = new Set(squares.map((s) => s.id));
for (let i = roads.length - 1; i >= 0; i--) if (squareIds.has(roads[i].id)) roads.splice(i, 1);

/* ---------- verde e alberi ---------- */

const treesPath = path.join(CACHE, 'trees.json');
const rawTrees = fs.existsSync(treesPath) ? read('trees.json').elements : [];

const greenIds = new Set(green.map((g) => g.id));
const addGreen = (id, kind, ring) => {
  if (!ring || greenIds.has(id)) return;
  greenIds.add(id);
  green.push({ id, kind, ring, area: areaOf(ring) });
};

const greenKind = (t) => {
  if (t.leisure === 'park' || t.leisure === 'garden') return t.leisure;
  if (['grass', 'meadow', 'village_green', 'vineyard', 'farmland', 'forest', 'orchard'].includes(t.landuse)) return t.landuse;
  if (['wood', 'scrub', 'grassland', 'heath'].includes(t.natural)) return t.natural;
  return null;
};

/**
 * Le relazioni multipoligono arrivano come pezzi di contorno sparsi, in
 * ordine e verso qualsiasi: si ricuciono per estremi coincidenti. Un bosco
 * sulla Rocca e' quasi sempre una relazione, non una way chiusa.
 */
function joinRings(members) {
  const segs = members
    .filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '') && m.geometry)
    .map((m) => m.geometry.filter((g) => g && g.lat != null).map((g) => proj.forward(g.lat, g.lon)))
    .filter((s) => s.length >= 2);
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
  const rings = [];
  while (segs.length) {
    let cur = segs.shift();
    let grew = true;
    while (!close(cur[0], cur[cur.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const end = cur[cur.length - 1];
        if (close(end, s[0])) cur = cur.concat(s.slice(1));
        else if (close(end, s[s.length - 1])) cur = cur.concat(s.slice(0, -1).reverse());
        else continue;
        segs.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (close(cur[0], cur[cur.length - 1])) cur.pop();
    if (cur.length >= 3) rings.push(toCCW(cur));
  }
  return rings;
}

/** Passo dei filari: i platani del lungolago stanno a 7-9 m. */
const ROW_STEP = 8;
const trees = [];
let openRings = 0;
for (const el of [...rawWays, ...rawTrees]) {
  const t = el.tags ?? {};
  if (el.type === 'node') {
    if (t.natural === 'tree' && el.lat != null) {
      const [x, y] = proj.forward(el.lat, el.lon);
      trees.push({ x: +x.toFixed(2), y: +y.toFixed(2), leaf: t.leaf_type ?? null, src: 'osm' });
    }
    continue;
  }
  if (el.type === 'way' && t.natural === 'tree_row') {
    const pts = el.geometry?.filter((g) => g && g.lat != null).map((g) => proj.forward(g.lat, g.lon)) ?? [];
    for (const run of clipPolyline(pts, ...CLIP)) {
      let carry = 0;
      for (let i = 0; i < run.length - 1; i++) {
        const [ax, ay] = run[i];
        const [bx, by] = run[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-6) continue;
        let d = carry;
        while (d <= len) {
          const k = d / len;
          trees.push({ x: +(ax + (bx - ax) * k).toFixed(2), y: +(ay + (by - ay) * k).toFixed(2), leaf: t.leaf_type ?? 'broadleaved', src: 'row' });
          d += ROW_STEP;
        }
        carry = d - len;
      }
    }
    continue;
  }
  const kind = greenKind(t);
  if (!kind || t.highway) continue;
  if (el.type === 'way') addGreen(el.id, kind, ringOf(el));
  else if (el.type === 'relation') {
    const rings = joinRings(el.members ?? []);
    if (!rings.length) openRings++;
    rings.forEach((ring, k) => addGreen(`r${el.id}_${k}`, kind, ring));
  }
}

/* ---------- darsena e moli ---------- */

const LAKE_Z = 64.15;   // pelo del lago misurato sul DTM (64.0-64.1)
/**
 * La darsena e' acqua nel poligono OSM (anello a 2 m) ma terra nel DEM a
 * 12.5 m: senza scavo il porto sarebbe un prato. I vertici del DEM dentro gli
 * specchi d'acqua piccoli (sotto 20 ha: il lago intero non e' un poligono qui)
 * scendono 1.5 m sotto il pelo. Lo scavo va nel terreno di site.json, cosi'
 * mesh, collisione, suolo e nav vedono la stessa darsena.
 */
const terrainZ = dem.z.slice();
let carved = 0;
for (const w of water) {
  if (w.area > 200000) continue;
  for (let j = 0; j < dem.ny; j++) {
    for (let i = 0; i < dem.nx; i++) {
      const x = dem.x0 + i * dem.step;
      const y = dem.y0 + j * dem.step;
      if (!pointInRing(w.ring, x, y)) continue;
      const k = j * dem.nx + i;
      if (terrainZ[k] > LAKE_Z - 1.5) {
        terrainZ[k] = LAKE_Z - 1.5;
        carved++;
      }
    }
  }
}

/**
 * Riva vera nella zona rifinita (`orto.mjs`). Il DEM a 12.5 m non sa dove
 * finisce la terra: davanti al porto sbagliava di 40 m. Dove l'ortofoto dice
 * acqua il vertice va sotto il pelo; dove dice terra ma un vicino e' acqua, va
 * appena sotto il pelo, e la banchina lastricata di `ground.mjs`/Blender lo
 * copre alla quota vera. Cosi' nessuna falda di terreno sporge oltre il muro.
 */
let shoreCarved = 0;
let shoreSunk = 0;
if (fs.existsSync(path.join(CACHE, 'orto_mask.png'))) {
  const { decodePNG } = await import('./png.mjs');
  const { ORTO_ZONE: OZ } = await import('./site.config.mjs');
  const om = decodePNG(fs.readFileSync(path.join(CACHE, 'orto_mask.png')));
  const wetState = new Int8Array(dem.nx * dem.ny).fill(-1);
  for (let j = 0; j < dem.ny; j++) {
    for (let i = 0; i < dem.nx; i++) {
      const x = dem.x0 + i * dem.step;
      const y = dem.y0 + j * dem.step;
      const u = Math.round((x - OZ.x0) / OZ.px);
      const v = Math.round((OZ.y1 - y) / OZ.px);
      if (u < 0 || v < 0 || u >= om.width || v >= om.height) continue;
      wetState[j * dem.nx + i] = om.rgb[(v * om.width + u) * 3] > 127 ? 1 : 0;
    }
  }
  for (let j = 0; j < dem.ny; j++) {
    for (let i = 0; i < dem.nx; i++) {
      const k = j * dem.nx + i;
      if (wetState[k] === 1) {
        if (terrainZ[k] > LAKE_Z - 2) {
          terrainZ[k] = LAKE_Z - 2;
          shoreCarved++;
        }
      } else if (wetState[k] === 0) {
        let nearWater = false;
        for (let dj = -1; dj <= 1 && !nearWater; dj++) {
          for (let di = -1; di <= 1; di++) {
            const jj = j + dj;
            const ii = i + di;
            if (jj >= 0 && ii >= 0 && jj < dem.ny && ii < dem.nx && wetState[jj * dem.nx + ii] === 1) nearWater = true;
          }
        }
        if (nearWater && terrainZ[k] > LAKE_Z - 0.2) {
          terrainZ[k] = LAKE_Z - 0.2;
          shoreSunk++;
        }
      }
    }
  }
}
console.log(`riva (ortofoto)  vertici DEM portati in acqua ${shoreCarved}, abbassati sotto la banchina ${shoreSunk}, scavati per la darsena OSM ${carved}`);

/** Moli: aree (`area=yes` o anello chiuso) e linee con larghezza. */
const piers = [];
const pierSeen = new Set();
for (const el of [...rawWays, ...rawPois]) {
  const t = el.tags ?? {};
  if (el.type !== 'way' || t.man_made !== 'pier' || !el.geometry || pierSeen.has(el.id)) continue;
  pierSeen.add(el.id);
  const pts = el.geometry.filter((g) => g && g.lat != null).map((g) => proj.forward(g.lat, g.lon));
  if (pts.length < 2) continue;
  const closed = pts.length >= 4 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5;
  const width = Number.parseFloat(t.width);
  if (closed) {
    const ring = toCCW(pts.slice(0, -1));
    piers.push({ id: el.id, kind: 'area', surface: t.surface ?? null, pts: ring.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]) });
  } else {
    piers.push({ id: el.id, kind: 'line', surface: t.surface ?? null, width: Number.isFinite(width) ? width : 2.6, pts: pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]) });
  }
}

/* ---------- output ---------- */

const [x0, y0] = proj.forward(BBOX.south, BBOX.west);
const [x1, y1] = proj.forward(BBOX.north, BBOX.east);

const site = {
  meta: {
    bbox: BBOX,
    metric: { x0, y0, x1, y1, width: x1 - x0, depth: y1 - y0 },
    levelHeight: LEVEL_H,
    roof: { pitch: ROOF_PITCH, tan: ROOF_TAN, maxInset: ROOF_MAX_INSET, overhang: ROOF_OVERHANG },
    arena,
    generated: new Date().toISOString(),
    // CC BY 3.0 della CTRN chiede l'attribuzione quanto l'ODbL di OSM.
    attribution:
      'OpenStreetMap contributors (ODbL) - EU-DEM (c) European Union, Copernicus - CTRN (c) Regione del Veneto (CC BY 3.0)',
  },
  terrain: { nx: dem.nx, ny: dem.ny, step: dem.step, x0: dem.x0, y0: dem.y0, z: terrainZ },
  piers,
  buildings: buildings.map((b) => ({
    id: b.id,
    ring: b.ring.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]),
    base: +b.base.toFixed(2),
    eaves: +b.eaves.toFixed(2),
    top: +b.top.toFixed(2),
    inset: +b.inset.toFixed(2),
    zone: b.zone,
    height: +b.height.toFixed(2),
    levels: b.levels,
    kind: b.tags.building ?? 'yes',
    src: b.heightSource,
    name: b.tags.name ?? null,
    area: +b.area.toFixed(1),
    n40: b.n40,
  })),
  roads,
  walls,
  water,
  green,
  squares,
  trees,
  pois,
};

fs.writeFileSync(path.join(CACHE, 'site.json'), JSON.stringify(site));
console.log(`piazze ${squares.length}   alberi ${trees.length}   verde ${green.length}   relazioni non richiuse ${openRings}`);

/* ---------- referto ---------- */

const bySrc = {};
for (const b of buildings) bySrc[b.heightSource] = (bySrc[b.heightSource] ?? 0) + 1;
const byLev = {};
for (const b of buildings) byLev[b.levels] = (byLev[b.levels] ?? 0) + 1;

const lakeZ = Math.min(...dem.z);
const peakZ = Math.max(...dem.z);
const originZ = sampleZ(0, 0);
const sizeKB = (fs.statSync(path.join(CACHE, 'site.json')).size / 1024).toFixed(0);

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('edifici', 17) + buildings.length + '  (scartati sotto 12 mq: ' + (rawBuildings.length - buildings.length) + ')');
console.log(pad('altezza da', 17) + JSON.stringify(bySrc));
console.log(pad('piani', 17) + JSON.stringify(byLev));
console.log(pad('n40 istogramma', 17) + JSON.stringify(n40Hist));
console.log(pad('strade', 17) + roads.length + '   muri ' + walls.length + '   acqua ' + water.length + '   verde ' + green.length + '   poi ' + pois.length);
console.log(pad('terreno', 17) + dem.nx + 'x' + dem.ny + ' @ ' + dem.step + ' m   z ' + lakeZ.toFixed(1) + '..' + peakZ.toFixed(1) + ' m');
console.log(pad('quota origine', 17) + originZ.toFixed(1) + ' m   (lago ' + lakeZ.toFixed(1) + ' m -> franco ' + (originZ - lakeZ).toFixed(1) + ' m)');
const byZone = {};
for (const b of buildings) byZone[b.zone] = (byZone[b.zone] ?? 0) + 1;
console.log(pad('arena', 17) + ARENA_SIDE + 'x' + ARENA_SIDE + ' m a x[' + arena.x0.toFixed(0) + '..' + arena.x1.toFixed(0) + '] y[' + arena.y0.toFixed(0) + '..' + arena.y1.toFixed(0) + ']');
console.log(pad('', 17) + 'costruito ' + (arena.built / 10000).toFixed(2) + ' ha su ' + ((ARENA_SIDE * ARENA_SIDE) / 10000).toFixed(0) + ' ha -> copertura ' + ((100 * arena.built) / (ARENA_SIDE * ARENA_SIDE)).toFixed(1) + '%');
console.log(pad('zone', 17) + JSON.stringify(byZone));
const flat = buildings.filter((b) => b.inset === 0).length;
console.log(pad('tetti', 17) + (buildings.length - flat) + ' a falde, ' + flat + ' piani (solidita sotto ' + SOLIDITY_MIN + ')');
console.log(pad('site.json', 17) + sizeKB + ' KB');
