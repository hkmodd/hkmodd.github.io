/**
 * Misura il perimetro della nuova arena: Punta San Vigilio, Monte Luppia,
 * La Rocca, dentro il comune di Garda.
 *
 * Non decide niente a occhio. Scarica da Overpass il confine amministrativo
 * del comune e i punti notevoli, poi calcola la bbox che li contiene e quanto
 * costa in punti di terreno alle risoluzioni possibili.
 *
 * Scrive in tools/garda/cache/p2_*.json. Non tocca nulla della pipeline vecchia.
 * Licenza dati: OSM -> ODbL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { OVERPASS_ENDPOINTS, makeProjection } from './site.config.mjs';

const CACHE = path.resolve(import.meta.dirname, 'cache');
const FORCE = process.argv.includes('--force');
const UA = 'hkmodd.github.io garda-arena/0.2 (+https://github.com/hkmodd)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(CACHE, { recursive: true });

async function overpass(name, body) {
  const p = path.join(CACHE, name);
  if (!FORCE && fs.existsSync(p) && fs.statSync(p).size > 512) {
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`· ${name} in cache  ${c.elements.length} elementi`);
    return c;
  }
  const query = `[out:json][timeout:180];${body}`;
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: new URLSearchParams({ data: query }),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith('{')) {
        lastErr = new Error(`${endpoint} -> ${res.status} ${text.slice(0, 120)}`);
        console.warn(`  ! ${lastErr.message}`);
        await sleep(4000);
        continue;
      }
      const json = JSON.parse(text);
      fs.writeFileSync(p, text);
      console.log(`✓ ${name}  ${json.elements.length} elementi  (${endpoint.split('/')[2]})`);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn(`  ! ${err.message}`);
      await sleep(4000);
    }
  }
  throw lastErr;
}

// Finestra di ricerca larga: il lago fra Garda e Torri del Benaco.
const SEARCH = '45.52,10.62,45.64,10.80';

const comune = await overpass(
  'p2_comune.json',
  `rel["boundary"="administrative"]["admin_level"="8"]["name"="Garda"](${SEARCH});out geom;`,
);

const punti = await overpass(
  'p2_punti.json',
  `(
     node["natural"="peak"](${SEARCH});
     node["name"~"Vigilio",i](${SEARCH});
     node["name"~"Luppia",i](${SEARCH});
     way["name"~"Luppia",i](${SEARCH});
     node["place"]["name"~"Garda|Torri del Benaco",i](${SEARCH});
   );out center;`,
);

// --- confine del comune: tutti i vertici delle way membro ---
const ring = [];
for (const el of comune.elements) {
  if (el.type !== 'relation') continue;
  for (const m of el.members || []) {
    if (!m.geometry) continue;
    for (const g of m.geometry) ring.push([g.lat, g.lon]);
  }
}
if (!ring.length) throw new Error('confine comunale vuoto: controlla la query');

const lat = ring.map((p) => p[0]);
const lon = ring.map((p) => p[1]);
const com = {
  south: Math.min(...lat), north: Math.max(...lat),
  west: Math.min(...lon), east: Math.max(...lon),
};

console.log(`\n=== COMUNE DI GARDA (OSM, ${ring.length} vertici di confine) ===`);
console.log(`bbox  ${com.south.toFixed(5)}..${com.north.toFixed(5)} N  ${com.west.toFixed(5)}..${com.east.toFixed(5)} E`);

const proj = makeProjection({ lat: (com.south + com.north) / 2, lon: (com.west + com.east) / 2 });
const wKm = ((com.east - com.west) * proj.mLon) / 1000;
const hKm = ((com.north - com.south) * proj.mLat) / 1000;
console.log(`esteso  ${wKm.toFixed(2)} km E-O  x  ${hKm.toFixed(2)} km N-S`);

// --- punti notevoli ---
console.log(`\n=== CAPISALDI ===`);
const notevoli = [];
for (const el of punti.elements) {
  const t = el.tags || {};
  const name = t.name || t['name:it'];
  if (!name) continue;
  const la = el.lat ?? el.center?.lat;
  const lo = el.lon ?? el.center?.lon;
  if (la == null) continue;
  const dentro = la >= com.south && la <= com.north && lo >= com.west && lo <= com.east;
  notevoli.push({ name, kind: t.natural || t.place || t.tourism || '—', lat: la, lon: lo, ele: t.ele || '', dentro });
}
notevoli.sort((a, b) => a.name.localeCompare(b.name));
for (const n of notevoli) {
  console.log(
    `${n.dentro ? 'IN ' : '   '} ${n.name.padEnd(28)} ${String(n.kind).padEnd(10)} ` +
    `${n.lat.toFixed(5)} ${n.lon.toFixed(5)}  ${n.ele ? n.ele + ' m' : ''}`,
  );
}

fs.writeFileSync(
  path.join(CACHE, 'p2_report.json'),
  JSON.stringify({ comune: com, ringVertices: ring.length, wKm, hKm, notevoli }, null, 2),
);
console.log('\n-> cache/p2_report.json');

// ---------------------------------------------------------------------------
// ARENA PROPOSTA: da Punta San Vigilio al confine est, dalla Rocca a Luppia.
// I bordi sono il confine comunale dove esiste, il caposaldo + margine dove
// il confine e' in mezzo al lago.
// ---------------------------------------------------------------------------
const SANVIGILIO_LON = 10.67191;
const ARENA = {
  south: com.south,                    // confine sud, sotto La Rocca
  north: com.north,                    // confine nord, sopra Monte Luppia
  west: SANVIGILIO_LON - 0.0025,       // ~200 m di lago oltre la punta
  east: com.east,                      // confine est
};

const pa = makeProjection({ lat: (ARENA.south + ARENA.north) / 2, lon: (ARENA.west + ARENA.east) / 2 });
const aW = (ARENA.east - ARENA.west) * pa.mLon;
const aH = (ARENA.north - ARENA.south) * pa.mLat;
const aKm2 = (aW * aH) / 1e6;

console.log(`\n=== ARENA PROPOSTA ===`);
console.log(`bbox   ${ARENA.south.toFixed(5)}..${ARENA.north.toFixed(5)} N  ${ARENA.west.toFixed(5)}..${ARENA.east.toFixed(5)} E`);
console.log(`misura ${(aW / 1000).toFixed(2)} x ${(aH / 1000).toFixed(2)} km  =  ${aKm2.toFixed(2)} km2`);
console.log(`        contro arena vecchia 0.44 x 0.44 km = 0.19 km2  ->  ${(aKm2 / 0.1936).toFixed(0)}x`);

console.log(`\ncosto del terreno, punti di griglia:`);
for (const step of [1, 2, 5, 10]) {
  const n = (aW / step) * (aH / step);
  const tris = n * 2;
  console.log(
    `  ${String(step).padStart(2)} m ->  ${(n / 1e6).toFixed(2).padStart(7)} M punti   ` +
    `${(tris / 1e6).toFixed(1).padStart(6)} M triangoli   ` +
    `heightmap 16-bit ${((n * 2) / 1024 / 1024).toFixed(1)} MB`,
  );
}

const edifici = await overpass(
  'p2_edifici.json',
  `way["building"](${ARENA.south},${ARENA.west},${ARENA.north},${ARENA.east});out tags center;`,
);
const b = edifici.elements.filter((e) => e.center);
const conLevels = b.filter((e) => e.tags?.['building:levels']).length;
const conHeight = b.filter((e) => e.tags?.height).length;
console.log(`\nedifici OSM nell'arena: ${b.length}`);
console.log(`  con height          : ${conHeight}`);
console.log(`  con building:levels : ${conLevels}  (${((conLevels / b.length) * 100).toFixed(1)}%)`);
console.log(`  -> altezze da CTRN, non da OSM`);

// acqua contro terra: il poligono del lago dentro l'arena
const acqua = await overpass(
  'p2_acqua.json',
  `(way["natural"="water"](${ARENA.south},${ARENA.west},${ARENA.north},${ARENA.east});
    rel["natural"="water"](${ARENA.south},${ARENA.west},${ARENA.north},${ARENA.east}););out tags center;`,
);
const laghi = acqua.elements.filter((e) => (e.tags?.name || '').match(/Garda|Benaco/i));
console.log(`\npoligoni d'acqua trovati: ${acqua.elements.length} (di cui lago di Garda: ${laghi.length})`);

fs.writeFileSync(
  path.join(CACHE, 'p2_arena.json'),
  JSON.stringify({ arena: ARENA, wM: aW, hM: aH, km2: aKm2, edifici: b.length, conHeight, conLevels }, null, 2),
);
console.log('-> cache/p2_arena.json');
