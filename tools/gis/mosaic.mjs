/**
 * Mosaica i tile DTM LiDAR 5 m in UNA griglia dell'arena, pronta per
 * `importgis.asc_file` di BlenderGIS.
 *
 * Due scelte che valgono piu' del codice:
 *
 * 1. L'arena e' definita come rettangolo IN EPSG:6876, allineato alla griglia
 *    del DTM. La bbox in lat/lon non e' un rettangolo in proiezione (1.217
 *    gradi di convergenza, vedi ARENA.md §1bis): inseguirla costringerebbe a
 *    ruotare e ricampionare il terreno. Allineandosi alla griglia, ogni cella
 *    del mosaico coincide ESATTAMENTE con una cella sorgente e il dato passa
 *    per copia, senza interpolazione. Il rettangolo contiene tutto il
 *    perimetro chiesto, con un margine dovuto alla rotazione.
 *
 * 2. Il `nodata` non e' un buco solo: il lago e' `nodata` per costruzione (il
 *    LiDAR non penetra l'acqua) e va distinto dai buchi veri a terra. Il lago
 *    si riconosce perche' e' la regione di `nodata` connessa al bordo della
 *    griglia; i buchi a terra restano isolati e si riempiono dai vicini.
 *    Riempirli tutti allo stesso modo produrrebbe un lago a imbuto.
 *
 *   node tools/gis/mosaic.mjs
 *
 * Scrive: tools/gis/out/arena.asc  (quote, per BlenderGIS)
 *         tools/gis/out/arena.acqua.pgm (maschera: 255 = acqua)
 *         tools/gis/out/arena.json (metadati per il runtime)
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, 'cache/dtm');
const OUT = path.resolve(import.meta.dirname, 'out');
const CELL = 5;

/**
 * Arena in EPSG:6876, multipli di 5 m. Contiene i quattro angoli della bbox
 * WGS84 45.56713..45.59061 / 10.66941..10.73965 proiettati (ARENA.md §1bis).
 */
const ARENA = { x0: 2896125, y0: 5048745, x1: 2901655, y1: 5051445 };

const NCOLS = (ARENA.x1 - ARENA.x0) / CELL;
const NROWS = (ARENA.y1 - ARENA.y0) / CELL;
const NODATA = -9999;

function readAsc(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const head = {};
  let pos = 0;
  for (let i = 0; i < 6; i++) {
    const end = txt.indexOf('\n', pos);
    const [k, v] = txt.slice(pos, end).trim().split(/\s+/);
    head[k.toLowerCase()] = parseFloat(v);
    pos = end + 1;
  }
  const { ncols, nrows, cellsize } = head;
  const x0 = (head.xllcenter ?? head.xllcorner + cellsize / 2) - cellsize / 2;
  const y0 = (head.yllcenter ?? head.yllcorner + cellsize / 2) - cellsize / 2;
  const z = new Float32Array(ncols * nrows);
  let i = 0;
  for (const m of txt.slice(pos).matchAll(/-?\d+(?:\.\d+)?/g)) {
    z[i++] = parseFloat(m[0]);
    if (i >= z.length) break;
  }
  return { ncols, nrows, cellsize, x0, y0, z, nodata: head.nodata_value };
}

const tiles = fs.readdirSync(DIR).filter((f) => f.endsWith('.asc'))
  .map((f) => readAsc(path.join(DIR, f)));
console.log(`tile disponibili: ${tiles.length}`);

// --- mosaico, riga 0 = piu' a NORD (convenzione ASCII Grid) ---
const grid = new Float32Array(NCOLS * NROWS).fill(NODATA);
let copiate = 0;
for (const t of tiles) {
  // intersezione fra il tile e l'arena, in indici di mosaico
  const iMin = Math.max(0, Math.round((t.x0 - ARENA.x0) / CELL));
  const iMax = Math.min(NCOLS, Math.round((t.x0 + t.ncols * CELL - ARENA.x0) / CELL));
  const jMin = Math.max(0, Math.round((t.y0 - ARENA.y0) / CELL));
  const jMax = Math.min(NROWS, Math.round((t.y0 + t.nrows * CELL - ARENA.y0) / CELL));
  for (let j = jMin; j < jMax; j++) {
    for (let i = iMin; i < iMax; i++) {
      const ti = i - Math.round((t.x0 - ARENA.x0) / CELL);
      const tj = j - Math.round((t.y0 - ARENA.y0) / CELL);
      const v = t.z[(t.nrows - 1 - tj) * t.ncols + ti];
      if (v === t.nodata) continue;
      grid[(NROWS - 1 - j) * NCOLS + i] = v;
      copiate++;
    }
  }
}
console.log(`celle coperte da dato valido: ${copiate} su ${NCOLS * NROWS} (${((100 * copiate) / (NCOLS * NROWS)).toFixed(1)}%)`);

// --- lago = nodata connesso al bordo. Flood fill iterativo (BFS su indici). ---
const acqua = new Uint8Array(NCOLS * NROWS);
const coda = [];
const push = (i, j) => {
  const k = j * NCOLS + i;
  if (i < 0 || j < 0 || i >= NCOLS || j >= NROWS) return;
  if (acqua[k] || grid[k] !== NODATA) return;
  acqua[k] = 255;
  coda.push(k);
};
for (let i = 0; i < NCOLS; i++) { push(i, 0); push(i, NROWS - 1); }
for (let j = 0; j < NROWS; j++) { push(0, j); push(NCOLS - 1, j); }
for (let q = 0; q < coda.length; q++) {
  const k = coda[q], i = k % NCOLS, j = (k - i) / NCOLS;
  push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1);
}
const nAcqua = acqua.reduce((s, v) => s + (v ? 1 : 0), 0);

// --- buchi a terra: nodata NON marcato acqua. Riempimento iterativo dai vicini. ---
let buchi = 0;
for (let k = 0; k < grid.length; k++) if (grid[k] === NODATA && !acqua[k]) buchi++;
const buchiIniziali = buchi;
let giri = 0;
while (buchi > 0 && giri < 200) {
  const patch = [];
  for (let j = 0; j < NROWS; j++) {
    for (let i = 0; i < NCOLS; i++) {
      const k = j * NCOLS + i;
      if (grid[k] !== NODATA || acqua[k]) continue;
      let s = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= NCOLS || jj >= NROWS) continue;
        const kk = jj * NCOLS + ii;
        if (grid[kk] !== NODATA) { s += grid[kk]; n++; }
      }
      if (n) patch.push([k, s / n]);
    }
  }
  if (!patch.length) break;
  for (const [k, v] of patch) grid[k] = v;
  buchi -= patch.length;
  giri++;
}
console.log(`acqua: ${nAcqua} celle (${((100 * nAcqua) / grid.length).toFixed(1)}%)`);
console.log(`buchi a terra: ${buchiIniziali} celle, riempiti in ${giri} giri, residui ${buchi}`);

// --- il lago prende una quota: pelo dell'acqua meno un margine ---
let min = Infinity, max = -Infinity;
for (let k = 0; k < grid.length; k++) if (grid[k] !== NODATA) { if (grid[k] < min) min = grid[k]; if (grid[k] > max) max = grid[k]; }
const PELO = min; // la quota piu' bassa rilevata a terra e' la riva
for (let k = 0; k < grid.length; k++) if (grid[k] === NODATA) grid[k] = PELO - 1;
console.log(`quote  min ${min.toFixed(1)}  max ${max.toFixed(1)}  (lago posato a ${(PELO - 1).toFixed(1)})`);

// --- scrittura ---
fs.mkdirSync(OUT, { recursive: true });
const righe = [
  `ncols         ${NCOLS}`,
  `nrows         ${NROWS}`,
  `xllcorner     ${ARENA.x0}`,
  `yllcorner     ${ARENA.y0}`,
  `cellsize      ${CELL}`,
  `NODATA_value  ${NODATA}`,
];
for (let j = 0; j < NROWS; j++) {
  const r = new Array(NCOLS);
  for (let i = 0; i < NCOLS; i++) r[i] = grid[j * NCOLS + i].toFixed(2);
  righe.push(r.join(' '));
}
fs.writeFileSync(path.join(OUT, 'arena.asc'), righe.join('\n') + '\n');

// maschera acqua come PGM: leggibile ovunque, zero dipendenze
const pgm = Buffer.concat([
  Buffer.from(`P5\n${NCOLS} ${NROWS}\n255\n`, 'ascii'),
  Buffer.from(acqua.buffer, acqua.byteOffset, acqua.length),
]);
fs.writeFileSync(path.join(OUT, 'arena.acqua.pgm'), pgm);

fs.writeFileSync(path.join(OUT, 'arena.json'), JSON.stringify({
  crs: 'EPSG:6876', cell: CELL, ncols: NCOLS, nrows: NROWS,
  x0: ARENA.x0, y0: ARENA.y0, x1: ARENA.x1, y1: ARENA.y1,
  larghezzaM: ARENA.x1 - ARENA.x0, altezzaM: ARENA.y1 - ARENA.y0,
  zMin: min, zMax: max, peloAcqua: PELO, celleAcqua: nAcqua,
}, null, 2));

console.log(`\narena ${NCOLS} x ${NROWS} celle = ${(ARENA.x1 - ARENA.x0)} x ${(ARENA.y1 - ARENA.y0)} m`);
console.log(`-> out/arena.asc  out/arena.acqua.pgm  out/arena.json`);
