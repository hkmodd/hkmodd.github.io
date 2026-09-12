/**
 * Legge i tile DTM LiDAR 5 m della Regione del Veneto (ESRI ASCII Grid, fuso 12)
 * e verifica il dato sui capisaldi noti dell'arena.
 *
 * Il test di verita': se le quote campionate coincidono con quelle note
 * (lago, Rocca, Monte Luppia), la catena dato -> proiezione -> campionamento
 * e' sana. Se non coincidono, tutto quello che viene dopo e' costruito sul
 * nulla, e va fermato qui.
 *
 *   node tools/gis/dtm.mjs
 *
 * Dati: Regione del Veneto, DTM da rilievi LiDAR, celle 5 m.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, 'cache/dtm');

// --- Transverse Mercator generica (Snyder). UTM e i fusi italiani sono casi
// particolari: cambiano solo meridiano centrale, falso est e fattore di scala.
const a = 6378137.0, f = 1 / 298.257223563;
const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
const rad = (d) => (d * Math.PI) / 180;

function toTM(lat, lon, { lon0deg, k0, FE, FN = 0 }) {
  const lon0 = rad(lon0deg), p = rad(lat), l = rad(lon);
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2;
  const A = (l - lon0) * Math.cos(p);
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  const E = k0 * N * (A + ((1 - T + C) * A ** 3) / 6
      + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + FE;
  const Nn = FN + k0 * (M + N * Math.tan(p) * ((A ** 2) / 2
      + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24
      + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [E, Nn];
}

/** ETRF2000-RDN fuso 12: meridiano centrale 12 gradi, falso est 3 000 000. */
const FUSO12 = { lon0deg: 12, k0: 1, FE: 3_000_000 }; // EPSG:6876, k0 = 1 (NON 0.9996)
const UTM32 = { lon0deg: 9, k0: 0.9996, FE: 500_000 };

// --- lettura ESRI ASCII Grid ---
function readAsc(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const nl = txt.indexOf('\n');
  const head = {};
  let pos = 0, lines = 0;
  while (lines < 6) {
    const end = txt.indexOf('\n', pos);
    const [k, v] = txt.slice(pos, end).trim().split(/\s+/);
    head[k.toLowerCase()] = parseFloat(v);
    pos = end + 1;
    lines++;
  }
  const ncols = head.ncols, nrows = head.nrows, cell = head.cellsize;
  // xllcenter/yllcenter danno il CENTRO della cella in basso a sinistra;
  // xllcorner/yllcorner danno l'angolo. Vanno distinti o si sbaglia di mezza cella.
  const x0 = head.xllcenter !== undefined ? head.xllcenter : head.xllcorner + cell / 2;
  const y0 = head.yllcenter !== undefined ? head.yllcenter : head.yllcorner + cell / 2;
  const z = new Float32Array(ncols * nrows);
  const body = txt.slice(pos);
  let i = 0;
  for (const m of body.matchAll(/-?\d+(?:\.\d+)?/g)) {
    z[i++] = parseFloat(m[0]);
    if (i >= z.length) break;
  }
  if (i !== ncols * nrows) throw new Error(`${path.basename(file)}: letti ${i} valori su ${ncols * nrows}`);
  return { ncols, nrows, cell, x0, y0, z, nodata: head.nodata_value, name: path.basename(file) };
}

/** Quota al punto (x,y) in fuso 12, bilineare. null se fuori o nodata. */
function sample(t, x, y) {
  const cx = (x - t.x0) / t.cell;
  const cy = (y - t.y0) / t.cell;
  if (cx < 0 || cy < 0 || cx > t.ncols - 1 || cy > t.nrows - 1) return null;
  const i0 = Math.floor(cx), j0 = Math.floor(cy);
  const i1 = Math.min(i0 + 1, t.ncols - 1), j1 = Math.min(j0 + 1, t.nrows - 1);
  const fx = cx - i0, fy = cy - j0;
  // la prima riga del file e' la riga PIU' A NORD: l'asse y del file e' invertito
  const at = (i, j) => t.z[(t.nrows - 1 - j) * t.ncols + i];
  const v = [at(i0, j0), at(i1, j0), at(i0, j1), at(i1, j1)];
  if (v.some((q) => q === t.nodata)) return null;
  return v[0] * (1 - fx) * (1 - fy) + v[1] * fx * (1 - fy) + v[2] * (1 - fx) * fy + v[3] * fx * fy;
}

const tiles = fs.readdirSync(DIR).filter((f) => f.endsWith('.asc')).map((f) => readAsc(path.join(DIR, f)));
console.log(`tile letti: ${tiles.length}`);
const X0 = Math.min(...tiles.map((t) => t.x0 - t.cell / 2));
const X1 = Math.max(...tiles.map((t) => t.x0 - t.cell / 2 + t.ncols * t.cell));
const Y0 = Math.min(...tiles.map((t) => t.y0 - t.cell / 2));
const Y1 = Math.max(...tiles.map((t) => t.y0 - t.cell / 2 + t.nrows * t.cell));
console.log(`copertura fuso12  X ${X0}..${X1}  (${(X1 - X0) / 1000} km)`);
console.log(`                  Y ${Y0}..${Y1}  (${(Y1 - Y0) / 1000} km)`);

function quota(lat, lon) {
  const [x, y] = toTM(lat, lon, FUSO12);
  for (const t of tiles) {
    const z = sample(t, x, y);
    if (z !== null) return { z, x, y, tile: t.name };
  }
  return { z: null, x, y, tile: null };
}

const CAPISALDI = [
  ['Lago (davanti al porto)', 45.5760, 10.7060, 64.1, 1.5],
  ['Garda paese',             45.57565, 10.70853, 72, 8],
  ['La Rocca (cima)',         45.56924, 10.71324, 283, 12],
  ['Monte Luppia (cima)',     45.58763, 10.69145, 413, 12],
  ['Monte Bre',               45.58046, 10.68044, 303, 12],
  ['Monte Are',               45.58474, 10.68654, 372, 12],
  ['Punta San Vigilio',       45.57271, 10.67191, 70, 15],
];

console.log('\ncaposaldo                 atteso   misurato   scarto   tile');
let peggiore = 0, mancanti = 0;
for (const [nome, lat, lon, atteso, tol] of CAPISALDI) {
  const { z, tile } = quota(lat, lon);
  if (z === null) {
    console.log(`${nome.padEnd(24)} ${String(atteso).padStart(7)}      FUORI      —     —`);
    mancanti++;
    continue;
  }
  const d = z - atteso;
  const ok = Math.abs(d) <= tol ? ' ' : '!';
  peggiore = Math.max(peggiore, Math.abs(d));
  console.log(`${nome.padEnd(24)} ${String(atteso).padStart(7)} ${z.toFixed(1).padStart(10)} ${d.toFixed(1).padStart(8)} ${ok} ${tile ?? ''}`);
}
console.log(`\nscarto massimo ${peggiore.toFixed(1)} m, capisaldi fuori copertura: ${mancanti}`);

// copertura dell'arena: i 4 angoli + il centro
console.log('\ncopertura dell arena (bbox WGS84 45.56713..45.59061 / 10.66941..10.73965):');
const ANG = [[45.56713, 10.66941, 'SW'], [45.56713, 10.73965, 'SE'], [45.59061, 10.66941, 'NW'], [45.59061, 10.73965, 'NE']];
for (const [lat, lon, nome] of ANG) {
  const { z, x, y } = quota(lat, lon);
  const dentro = x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
  console.log(`  ${nome}  fuso12 ${x.toFixed(0)} ${y.toFixed(0)}  dentro=${dentro}  z=${z === null ? 'nodata/fuori' : z.toFixed(1)}`);
}
