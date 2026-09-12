/**
 * Legge lo strato "Edifici del Veneto" (SHP + DBF, EPSG:6876) e lo confronta
 * con l'arena: quanti edifici ci cadono dentro, quanti hanno quote vere.
 *
 * Shapefile e DBF si leggono senza dipendenze: sono due formati binari
 * semplici e documentati. Una dipendenza npm che legge SHP porterebbe piu'
 * codice di quanto ne toglie.
 *
 *   node tools/gis/ctrn.mjs
 *
 * Dati: Regione del Veneto / ARPAV, "Edifici del Veneto", agg. feb 2022.
 */
import fs from 'node:fs';
import path from 'node:path';

const CACHE = path.resolve(import.meta.dirname, 'cache/ctrn');
const OUT = path.resolve(import.meta.dirname, 'out');
const ARENA = JSON.parse(fs.readFileSync(path.join(OUT, 'arena.json'), 'utf8'));

/** Descrittori di campo del DBF: 32 byte l'uno, a partire dal byte 32. */
function leggiDbf(file) {
  const b = fs.readFileSync(file);
  const nRec = b.readUInt32LE(4);
  const headLen = b.readUInt16LE(8);
  const recLen = b.readUInt16LE(10);
  const campi = [];
  let off = 32, pos = 1; // pos 0 e' il flag di cancellazione
  while (b[off] !== 0x0d && off < headLen) {
    const nome = b.toString('latin1', off, off + 11).replace(/\0.*$/, '');
    campi.push({ nome, tipo: String.fromCharCode(b[off + 11]), len: b[off + 16], pos });
    pos += b[off + 16];
    off += 32;
  }
  const record = (i) => {
    const base = headLen + i * recLen;
    const r = {};
    for (const c of campi) {
      r[c.nome] = b.toString('latin1', base + c.pos, base + c.pos + c.len).trim();
    }
    return r;
  };
  return { nRec, campi, record };
}

/** Header dello shapefile + centroide del bbox di ogni geometria. */
function leggiShp(file) {
  const b = fs.readFileSync(file);
  const bbox = {
    xmin: b.readDoubleLE(36), ymin: b.readDoubleLE(44),
    xmax: b.readDoubleLE(52), ymax: b.readDoubleLE(60),
  };
  const forme = [];
  let off = 100;
  while (off < b.length) {
    const lenParole = b.readInt32BE(off + 4);
    const tipo = b.readInt32LE(off + 8);
    if (tipo === 5 || tipo === 15 || tipo === 25) { // Polygon / PolygonZ / PolygonM
      forme.push({
        x: (b.readDoubleLE(off + 12) + b.readDoubleLE(off + 28)) / 2,
        y: (b.readDoubleLE(off + 20) + b.readDoubleLE(off + 36)) / 2,
      });
    } else {
      forme.push(null);
    }
    off += 8 + lenParole * 2;
  }
  return { bbox, forme };
}

const dentro = (x, y) => x >= ARENA.x0 && x <= ARENA.x1 && y >= ARENA.y0 && y <= ARENA.y1;

let totale = 0, nellArena = 0;
let campiVisti = null;
const conQuota = {};
const esempi = [];

for (const dir of fs.readdirSync(CACHE)) {
  const base = path.join(CACHE, dir, 'edifici_veneto_feb2022');
  if (!fs.existsSync(base + '.shp')) continue;
  const dbf = leggiDbf(base + '.dbf');
  const shp = leggiShp(base + '.shp');
  if (!campiVisti) {
    campiVisti = dbf.campi;
    console.log('CAMPI del DBF:');
    for (const c of dbf.campi) console.log(`  ${c.nome.padEnd(16)} ${c.tipo}  len ${c.len}`);
    console.log();
  }
  const n = Math.min(dbf.nRec, shp.forme.length);
  let qui = 0;
  for (let i = 0; i < n; i++) {
    const f = shp.forme[i];
    totale++;
    if (!f || !dentro(f.x, f.y)) continue;
    nellArena++;
    qui++;
    const r = dbf.record(i);
    for (const c of dbf.campi) {
      const v = r[c.nome];
      if (v !== '' && v !== '0' && v !== '0.00') conQuota[c.nome] = (conQuota[c.nome] ?? 0) + 1;
    }
    if (esempi.length < 3) esempi.push(r);
  }
  console.log(`${dir.slice(0, 5)}  record ${dbf.nRec}  geometrie ${shp.forme.length}  nell'arena ${qui}`);
}

console.log(`\nedifici totali letti: ${totale}`);
console.log(`edifici DENTRO l'arena: ${nellArena}`);
console.log('\ncampi valorizzati sugli edifici dell arena:');
for (const [k, v] of Object.entries(conQuota).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(16)} ${v}  (${((100 * v) / nellArena).toFixed(1)}%)`);
}
console.log('\nesempio di record:');
for (const e of esempi.slice(0, 2)) console.log(' ', JSON.stringify(e));
