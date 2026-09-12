/**
 * Estrae gli edifici dell'arena dal GeoDBT, classe UN_VOL (unita'
 * volumetriche, PolygonZ in EPSG:6876), con le QUOTE RILEVATE.
 *
 * Perche' UN_VOL e non EDIFC: nel layer "Edifici del Veneto" le Z sono tutte
 * a zero. In EDIFC le Z esistono ma sono il SEDIME a terra — misurato:
 * sottraendo il terreno viene una mediana di 0.3 m, cioe' l'edificio e' alto
 * quanto il suolo. L'alzato sta in UN_VOL, che porta esplicitamente
 * UN_VOL_QB (quota base), UN_VOL_QG (quota gronda) e UN_VOL_AV (altezza).
 *
 * E' la stessa grandezza che la v1 estraeva da ARPAV una cella alla volta via
 * WMS GetFeatureInfo, 247 chiamate per 1.5 km². Qui arriva tutta insieme.
 *
 *   node tools/gis/edifici.mjs
 *
 * Scrive out/edifici.json: pianta in metri locali + quote, pronto per Blender
 * e per il runtime.
 *
 * Dati: Regione del Veneto, GeoDBT lotto Verona Ovest, fuso 12.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const OUT = path.join(ROOT, 'out');
const EDIFC = path.join(ROOT, 'cache/ctrn/VeronaOvest_aree/UN_VOL');
const ARENA = JSON.parse(fs.readFileSync(path.join(OUT, 'arena.json'), 'utf8'));

// ---------- terreno: rileggo il mosaico gia' verificato ----------
function leggiAsc(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const h = {};
  let pos = 0;
  for (let i = 0; i < 6; i++) {
    const end = txt.indexOf('\n', pos);
    const [k, v] = txt.slice(pos, end).trim().split(/\s+/);
    h[k.toLowerCase()] = parseFloat(v);
    pos = end + 1;
  }
  const z = new Float32Array(h.ncols * h.nrows);
  let i = 0;
  for (const m of txt.slice(pos).matchAll(/-?\d+(?:\.\d+)?/g)) {
    z[i++] = parseFloat(m[0]);
    if (i >= z.length) break;
  }
  return { ...h, z };
}
const dtm = leggiAsc(path.join(OUT, 'arena.asc'));
/** Quota del terreno a (x,y) in EPSG:6876. La riga 0 del file e' la piu' a nord. */
function terreno(x, y) {
  const i = Math.round((x - dtm.xllcorner) / dtm.cellsize - 0.5);
  const j = Math.round((y - dtm.yllcorner) / dtm.cellsize - 0.5);
  if (i < 0 || j < 0 || i >= dtm.ncols || j >= dtm.nrows) return null;
  return dtm.z[(dtm.nrows - 1 - j) * dtm.ncols + i];
}

// ---------- DBF ----------
function leggiDbf(file) {
  const b = fs.readFileSync(file);
  const headLen = b.readUInt16LE(8), recLen = b.readUInt16LE(10);
  const campi = [];
  let off = 32, pos = 1;
  while (b[off] !== 0x0d && off < headLen) {
    campi.push({
      nome: b.toString('latin1', off, off + 11).replace(/\0.*$/, ''),
      len: b[off + 16], pos,
    });
    pos += b[off + 16];
    off += 32;
  }
  return {
    n: b.readUInt32LE(4),
    record(i) {
      const base = headLen + i * recLen;
      const r = {};
      for (const c of campi) r[c.nome] = b.toString('latin1', base + c.pos, base + c.pos + c.len).trim();
      return r;
    },
  };
}

// ---------- SHP: PolygonZ ----------
const b = fs.readFileSync(EDIFC + '.shp');
const dbf = leggiDbf(EDIFC + '.dbf');

const dentro = (x, y) => x >= ARENA.x0 && x <= ARENA.x1 && y >= ARENA.y0 && y <= ARENA.y1;
const ox = (ARENA.x0 + ARENA.x1) / 2, oy = (ARENA.y0 + ARENA.y1) / 2;

const edifici = [];
let totale = 0, senzaZ = 0, senzaTerreno = 0;
let off = 100, idx = 0;

while (off < b.length) {
  const lenParole = b.readInt32BE(off + 4);
  const c = off + 8;
  const tipo = b.readInt32LE(c);
  off += 8 + lenParole * 2;
  const i = idx++;
  if (tipo !== 15) continue;
  totale++;

  const xmin = b.readDoubleLE(c + 4), ymin = b.readDoubleLE(c + 12);
  const xmax = b.readDoubleLE(c + 20), ymax = b.readDoubleLE(c + 28);
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  if (!dentro(cx, cy)) continue;

  const nParts = b.readInt32LE(c + 36), nPts = b.readInt32LE(c + 40);
  const partsOff = c + 44;
  const ptsOff = partsOff + nParts * 4;
  const zOff = ptsOff + nPts * 16 + 16; // dopo l'array XY e il range Z

  const parts = [];
  for (let p = 0; p < nParts; p++) parts.push(b.readInt32LE(partsOff + p * 4));

  const anelli = [];
  let zMin = Infinity, zMax = -Infinity;
  for (let p = 0; p < nParts; p++) {
    const da = parts[p], a = p + 1 < nParts ? parts[p + 1] : nPts;
    const anello = [];
    for (let k = da; k < a; k++) {
      const px = b.readDoubleLE(ptsOff + k * 16);
      const py = b.readDoubleLE(ptsOff + k * 16 + 8);
      const pz = b.readDoubleLE(zOff + k * 8);
      if (pz > 0) { if (pz < zMin) zMin = pz; if (pz > zMax) zMax = pz; }
      anello.push([+(px - ox).toFixed(2), +(py - oy).toFixed(2)]);
    }
    anelli.push(anello);
  }
  const r = dbf.record(i);
  // I campi di quota sono numerici testuali: vuoto o 0 = non rilevato.
  const num = (s) => { const v = parseFloat(s); return Number.isFinite(v) && v !== 0 ? v : null; };
  const qg = num(r.UN_VOL_QG);   // quota di gronda, m s.l.m.
  const qb = num(r.UN_VOL_QB);   // quota di base (piede), m s.l.m.
  const av = num(r.UN_VOL_AV);   // altezza dichiarata
  if (qg === null && av === null) { senzaZ++; continue; }

  const suolo = terreno(cx, cy);
  if (suolo === null) { senzaTerreno++; continue; }

  // Preferisco gronda-piede: e' una differenza fra due quote rilevate dallo
  // stesso volo, quindi non eredita l'errore del DTM. Il terreno entra solo
  // quando il piede manca.
  const altezza = qg !== null && qb !== null ? qg - qb
    : qg !== null ? qg - suolo
    : av;

  edifici.push({
    gronda: qg !== null ? +qg.toFixed(2) : null,
    piede: qb !== null ? +qb.toFixed(2) : null,
    suolo: +suolo.toFixed(2),
    altezza: +altezza.toFixed(2),
    zGeom: zMax === -Infinity ? null : +zMax.toFixed(2),
    por: r.UN_VOL_POR,
    anelli,
  });
}

console.log(`poligoni UN_VOL letti: ${totale}`);
console.log(`nell'arena con quota e terreno: ${edifici.length}`);
console.log(`scartati: ${senzaZ} senza quota, ${senzaTerreno} fuori dal DTM`);

const conGronda = edifici.filter((e) => e.gronda !== null).length;
const conPiede = edifici.filter((e) => e.piede !== null).length;
console.log(`  con quota di gronda: ${conGronda} (${((100 * conGronda) / edifici.length).toFixed(1)}%)`);
console.log(`  con quota di piede : ${conPiede} (${((100 * conPiede) / edifici.length).toFixed(1)}%)`);

const h = edifici.map((e) => e.altezza).sort((a, b2) => a - b2);
const q = (p) => h[Math.floor(p * (h.length - 1))];
console.log(`\naltezze rilevate (gronda - piede):`);
console.log(`  p10 ${q(0.1).toFixed(1)}  mediana ${q(0.5).toFixed(1)}  p90 ${q(0.9).toFixed(1)}  max ${q(1).toFixed(1)} m`);
const assurde = h.filter((v) => v < 1.5 || v > 40).length;
console.log(`  fuori 1.5..40 m: ${assurde} (${((100 * assurde) / h.length).toFixed(1)}%)`);
console.log(`  confronto v1: il modello inventato aveva mediana 7.0 m`);

// controllo incrociato: la gronda rilevata contro il terreno del DTM
const scarti = edifici.filter((e) => e.piede !== null)
  .map((e) => e.piede - e.suolo).sort((a, b2) => a - b2);
if (scarti.length) {
  const sq = (p) => scarti[Math.floor(p * (scarti.length - 1))];
  console.log(`\npiede rilevato meno terreno DTM (controllo incrociato di due fonti indipendenti):`);
  console.log(`  p10 ${sq(0.1).toFixed(2)}  mediana ${sq(0.5).toFixed(2)}  p90 ${sq(0.9).toFixed(2)} m`);
}

fs.writeFileSync(path.join(OUT, 'edifici.json'), JSON.stringify({
  crs: 'EPSG:6876', origine: [ox, oy], fonte: 'GeoDBT Verona Ovest, classe EDIFC',
  n: edifici.length, edifici,
}));
console.log(`\n-> out/edifici.json (${(fs.statSync(path.join(OUT, 'edifici.json')).size / 1024 / 1024).toFixed(2)} MB)`);
