/**
 * Terreno vero: DTM regionale a 5 m (`rv:DTM_RV_5m_3003`, IDT2 Regione del
 * Veneto) al posto di EU-DEM a 25 m.
 *
 * Il servizio WCS e' disabilitato e il WMS in GeoTIFF restituisce RGBA, cioe'
 * un'immagine colorata. Si chiede allora al WMS di CODIFICARE la quota nel
 * colore, con uno stile inviato nella richiesta (SLD_BODY):
 *
 *   passata grossolana  rampa lineare 60 -> 320 m su 8 bit  (±0.5 m)
 *   passata fine        dente di sega con periodo 4 m       (±1.6 cm)
 *   ricomposizione      z = 4*round((grossolana - fine)/4) + fine
 *
 * L'ambiguita' di fase si risolve perche' l'errore della grossolana (±0.5 m)
 * e' molto minore del mezzo periodo (2 m).
 *
 *   node dtm.mjs [--force] [--step 2.5]  ->  cache/dtm.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { BBOX, makeProjection } from './site.config.mjs';
import { decodePNG } from './png.mjs';

const HERE = path.resolve(import.meta.dirname);
const CACHE = path.join(HERE, 'cache');
const OUT = path.join(CACHE, 'dtm.json');
const args = process.argv.slice(2);
const STEP = Number(args[args.indexOf('--step') + 1]) || 2.5;
const LAYER = 'rv:DTM_RV_5m_3003';
const ENDPOINT = 'https://idt2-geoserver.regione.veneto.it/geoserver/ows';
const Z_MIN = 60;
const Z_MAX = 320;
const PERIOD = 4;

if (!args.includes('--force') && fs.existsSync(OUT) && fs.statSync(OUT).size > 1024) {
  console.log('· dtm.json in cache');
  process.exit(0);
}

const proj = makeProjection();
const [x0, y0] = proj.forward(BBOX.south, BBOX.west);
const [x1, y1] = proj.forward(BBOX.north, BBOX.east);
const nx = Math.round((x1 - x0) / STEP) + 1;
const ny = Math.round((y1 - y0) / STEP) + 1;

const sld = (entries) =>
  `<?xml version="1.0"?><StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld"><NamedLayer><Name>${LAYER}</Name>` +
  `<UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer><ColorMap type="ramp">${entries}</ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;

const coarseSld = sld(`<ColorMapEntry color="#000000" quantity="${Z_MIN}"/><ColorMapEntry color="#FFFFFF" quantity="${Z_MAX}"/>`);
let fineEntries = '';
for (let z = Z_MIN; z < Z_MAX; z += PERIOD) {
  fineEntries += `<ColorMapEntry color="#000000" quantity="${z}"/><ColorMapEntry color="#FFFFFF" quantity="${z + PERIOD - 0.001}"/>`;
}
const fineSld = sld(fineEntries);

async function grab(body) {
  const p = new URLSearchParams({
    service: 'WMS', version: '1.1.1', request: 'GetMap', layers: LAYER, srs: 'EPSG:4326',
    bbox: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`,
    width: String(nx), height: String(ny), format: 'image/png', SLD_BODY: body,
  });
  // POST: lo stile a dente di sega ha 130 voci e in URL supera la lunghezza
  // ammessa dal server, che risponde vuoto.
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'User-Agent': 'hkmodd garda/0.2', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.headers.get('content-type')?.startsWith('image')) throw new Error(`WMS: ${buf.toString().slice(0, 300)}`);
  return decodePNG(buf);
}

const coarse = await grab(coarseSld);
const fine = await grab(fineSld);
if (coarse.width !== nx || coarse.height !== ny) throw new Error(`immagine ${coarse.width}x${coarse.height}, attesa ${nx}x${ny}`);

// riga 0 dell'immagine = nord = y massima; la griglia del sito parte da sud
const z = new Array(nx * ny);
for (let j = 0; j < ny; j++) {
  const row = ny - 1 - j;
  for (let i = 0; i < nx; i++) {
    const k = row * nx + i;
    const c = Z_MIN + (coarse.rgb[k * 3] / 255) * (Z_MAX - Z_MIN);
    const f = (fine.rgb[k * 3] / 255) * PERIOD;
    z[j * nx + i] = +(Math.round((c - f) / PERIOD) * PERIOD + f).toFixed(2);
  }
}

fs.writeFileSync(OUT, JSON.stringify({ nx, ny, step: STEP, x0, y0, z, source: `${LAYER} (IDT2 Regione del Veneto), WMS SLD a due passate` }));

const sorted = [...z].sort((a, b) => a - b);
const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
console.log(`dtm.json        ${nx}x${ny} @ ${STEP} m  z ${q(0).toFixed(1)} .. ${q(1).toFixed(1)} m  mediana ${q(0.5).toFixed(1)}  (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);

// confronto con EU-DEM e con le quote CTRN
const eu = JSON.parse(fs.readFileSync(path.join(CACHE, 'dem.json'), 'utf8'));
const euAt = (x, y) => {
  const fx = Math.min(eu.nx - 1.001, Math.max(0, (x - eu.x0) / eu.step));
  const fy = Math.min(eu.ny - 1.001, Math.max(0, (y - eu.y0) / eu.step));
  const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, r = iy * eu.nx + ix;
  return (eu.z[r] * (1 - tx) + eu.z[r + 1] * tx) * (1 - ty) + (eu.z[r + eu.nx] * (1 - tx) + eu.z[r + eu.nx + 1] * tx) * ty;
};
const diff = [];
for (let j = 0; j < ny; j += 7) for (let i = 0; i < nx; i += 7) diff.push(euAt(x0 + i * STEP, y0 + j * STEP) - z[j * nx + i]);
diff.sort((a, b) => a - b);
console.log(`EU-DEM meno DTM: mediana ${diff[diff.length >> 1].toFixed(2)} m, p10 ${diff[Math.floor(diff.length * 0.1)].toFixed(2)}, p90 ${diff[Math.floor(diff.length * 0.9)].toFixed(2)}`);

const ctrnPath = path.join(CACHE, 'ctrn.json');
if (fs.existsSync(ctrnPath)) {
  const dtmAt = (x, y) => {
    const i = Math.round((x - x0) / STEP), j = Math.round((y - y0) / STEP);
    return i >= 0 && j >= 0 && i < nx && j < ny ? z[j * nx + i] : null;
  };
  const d = [];
  for (const f of JSON.parse(fs.readFileSync(ctrnPath, 'utf8')).features) {
    const ring = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0] : f.geometry.coordinates)[0];
    const [lon, lat] = ring[0];
    const [px, py] = proj.forward(lat, lon);
    const v = dtmAt(px, py);
    if (v != null) d.push(f.piede - v);
  }
  d.sort((a, b) => a - b);
  console.log(`piede CTRN meno DTM: mediana ${d[d.length >> 1].toFixed(2)} m su ${d.length} edifici  (con EU-DEM era -5.17)`);
}
