/**
 * Scarica i dati grezzi del sito: OSM via Overpass, quota via opentopodata.
 * Scrive in tools/garda/cache/. Idempotente: se il file c'e' e non e' vuoto,
 * non ripete la chiamata (--force per forzare).
 *
 * Licenze: OSM -> ODbL. EU-DEM -> Copernicus, ridistribuzione libera.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BBOX, DEM_STEP_M, OVERPASS_ENDPOINTS, makeProjection } from './site.config.mjs';

const CACHE = path.resolve(import.meta.dirname, 'cache');
const FORCE = process.argv.includes('--force');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Overpass e opentopodata rate-limitano i client anonimi. */
const UA = 'hkmodd.github.io garda-greybox/0.1 (+https://github.com/hkmodd)';

fs.mkdirSync(CACHE, { recursive: true });

const fresh = (file) => {
  const p = path.join(CACHE, file);
  return !FORCE && fs.existsSync(p) && fs.statSync(p).size > 1024;
};

const BB = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;

/** Una query Overpass, provata su piu' mirror finche' uno risponde JSON. */
async function overpass(name, body) {
  if (fresh(name)) {
    const cached = JSON.parse(fs.readFileSync(path.join(CACHE, name), 'utf8'));
    console.log(`· ${name} in cache  ${cached.elements.length} elementi`);
    return cached;
  }
  const query = `[out:json][timeout:180];${body}`;
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
        },
        body: new URLSearchParams({ data: query }),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith('{')) {
        lastErr = new Error(`${endpoint} -> ${res.status} ${text.slice(0, 140)}`);
        console.warn(`  ! ${lastErr.message}`);
        await sleep(5000);
        continue;
      }
      const json = JSON.parse(text);
      fs.writeFileSync(path.join(CACHE, name), text);
      console.log(`✓ ${name}  ${json.elements.length} elementi  (${endpoint.split('/')[2]})`);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn(`  ! ${err.message}`);
      await sleep(5000);
    }
  }
  throw lastErr ?? new Error(`nessun mirror ha risposto per ${name}`);
}

/**
 * Griglia DEM. opentopodata: 100 punti per chiamata, 1 chiamata/s.
 * eudem25m e' il piu' fine disponibile pubblicamente sull'Italia.
 */
async function dem() {
  if (fresh('dem.json')) {
    console.log('· dem.json in cache');
    return JSON.parse(fs.readFileSync(path.join(CACHE, 'dem.json'), 'utf8'));
  }
  const proj = makeProjection();
  const [x0, y0] = proj.forward(BBOX.south, BBOX.west);
  const [x1, y1] = proj.forward(BBOX.north, BBOX.east);
  const nx = Math.round((x1 - x0) / DEM_STEP_M) + 1;
  const ny = Math.round((y1 - y0) / DEM_STEP_M) + 1;

  const coords = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [lat, lon] = proj.inverse(x0 + i * DEM_STEP_M, y0 + j * DEM_STEP_M);
      coords.push([lat, lon]);
    }
  }

  const z = new Array(coords.length);
  const CHUNK = 100;
  console.log(`  DEM ${nx}x${ny} = ${coords.length} punti, ${Math.ceil(coords.length / CHUNK)} chiamate`);
  for (let k = 0; k < coords.length; k += CHUNK) {
    const slice = coords.slice(k, k + CHUNK);
    const locations = slice.map(([a, b]) => `${a.toFixed(6)},${b.toFixed(6)}`).join('|');
    const url = `https://api.opentopodata.org/v1/eudem25m?locations=${encodeURIComponent(locations)}`;
    let json = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      json = await res.json().catch(() => null);
      if (json?.status === 'OK') break;
      await sleep(2500 * (attempt + 1));
    }
    if (json?.status !== 'OK') {
      throw new Error(`DEM fallito al chunk ${k}: ${JSON.stringify(json).slice(0, 200)}`);
    }
    for (let i = 0; i < slice.length; i++) z[k + i] = json.results[i].elevation;
    process.stdout.write(`\r  ${Math.min(k + CHUNK, coords.length)}/${coords.length}`);
    await sleep(1100);
  }
  process.stdout.write('\n');

  const out = { nx, ny, step: DEM_STEP_M, x0, y0, z, dataset: 'eudem25m', source: 'opentopodata.org' };
  fs.writeFileSync(path.join(CACHE, 'dem.json'), JSON.stringify(out));
  const valid = z.filter((v) => v != null);
  console.log(`✓ dem.json  ${valid.length}/${z.length} validi  z ${Math.min(...valid).toFixed(1)}..${Math.max(...valid).toFixed(1)} m`);
  return out;
}

await overpass('buildings.json', `(way["building"](${BB});relation["building"](${BB}););out geom;`);
await overpass(
  'ways.json',
  `(way["highway"](${BB});way["barrier"](${BB});way["natural"="water"](${BB});` +
    `way["waterway"](${BB});way["landuse"](${BB});way["natural"="wood"](${BB});` +
    `way["natural"="scrub"](${BB});way["leisure"](${BB}););out geom;`,
);
await overpass(
  'pois.json',
  `(node["historic"](${BB});node["natural"="peak"](${BB});node["amenity"="place_of_worship"](${BB});` +
    `node["tourism"](${BB});way["man_made"="pier"](${BB}););out geom;`,
);
// Alberi singoli e filari: senza, il paese e' un plastico di cemento. Il
// lungolago di Garda e' fatto di platani e palme quanto di facciate.
await overpass(
  'trees.json',
  `(node["natural"="tree"](${BB});way["natural"="tree_row"](${BB});` +
    `way["leisure"="garden"](${BB});way["landuse"~"^(grass|meadow|vineyard|farmland|village_green)$"](${BB});` +
    `way["natural"~"^(grassland|heath)$"](${BB});relation["landuse"="forest"](${BB});relation["natural"="wood"](${BB}););out geom;`,
);
await dem();
console.log('\nfatto. cache/ pronta.');
