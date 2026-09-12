/**
 * Edifici CTRN della Regione Veneto -> cache/ctrn.json
 *
 * OSM da' le sagome ma non le altezze: misurato, 0 edifici su 431 con
 * `height`. La Carta Tecnica Regionale Numerica le ha, rilevate: per ogni
 * unita' volumetrica `piede` (quota del suolo) e `gronda` (quota della gronda),
 * entrambe assolute in metri s.l.m., piu' la sagoma. Strato `v_edifici` sul
 * GeoPortale ARPAV, licenza CC BY 3.0.
 *
 * Il WFS non espone lo strato; il WMS si'. Una GetFeatureInfo JSON con raggio
 * di tolleranza (`buffer`) restituisce anche la geometria: una chiamata per
 * cella da 80 m copre la cella intera (raggio 60 m > semidiagonale 56.6 m).
 * Chiamate sequenziali e distanziate: e' un servizio pubblico.
 *
 *   node ctrn.mjs [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { BBOX, makeProjection } from './site.config.mjs';

const CACHE = path.resolve(import.meta.dirname, 'cache');
const OUT = path.join(CACHE, 'ctrn.json');
const FORCE = process.argv.includes('--force');
const ENDPOINT = 'https://gaia.arpa.veneto.it/geoserver/ows';
const UA = 'hkmodd.github.io garda-greybox/0.2 (+https://github.com/hkmodd)';
const CELL_M = 80;
const PIXELS = 40; // 2 m per pixel
const BUFFER_PX = 30; // 60 m di raggio
const FEATURE_CAP = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!FORCE && fs.existsSync(OUT) && fs.statSync(OUT).size > 1024) {
  const cached = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  console.log(`· ctrn.json in cache  ${cached.features.length} edifici`);
  process.exit(0);
}

const proj = makeProjection();
const [x0, y0] = proj.forward(BBOX.south, BBOX.west);
const [x1, y1] = proj.forward(BBOX.north, BBOX.east);
const nx = Math.ceil((x1 - x0) / CELL_M);
const ny = Math.ceil((y1 - y0) / CELL_M);

const byId = new Map();
let maxInCell = 0;
let calls = 0;
for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
    const [south, west] = proj.inverse(x0 + i * CELL_M, y0 + j * CELL_M);
    const [north, east] = proj.inverse(x0 + (i + 1) * CELL_M, y0 + (j + 1) * CELL_M);
    const params = new URLSearchParams({
      service: 'WMS',
      version: '1.1.1',
      request: 'GetFeatureInfo',
      layers: 'geonode:v_edifici',
      query_layers: 'geonode:v_edifici',
      styles: '',
      srs: 'EPSG:4326',
      bbox: `${west},${south},${east},${north}`,
      width: String(PIXELS),
      height: String(PIXELS),
      x: String(PIXELS / 2),
      y: String(PIXELS / 2),
      info_format: 'application/json',
      feature_count: String(FEATURE_CAP),
      buffer: String(BUFFER_PX),
    });
    let json = null;
    for (let attempt = 0; attempt < 4 && !json; attempt++) {
      try {
        const res = await fetch(`${ENDPOINT}?${params}`, { headers: { 'User-Agent': UA } });
        const text = await res.text();
        if (res.ok && text.startsWith('{')) json = JSON.parse(text);
        else await sleep(2000 * (attempt + 1));
      } catch {
        await sleep(2000 * (attempt + 1));
      }
    }
    calls++;
    if (!json) throw new Error(`cella ${i},${j}: nessuna risposta valida dopo 4 tentativi`);
    maxInCell = Math.max(maxInCell, json.features.length);
    for (const f of json.features) {
      const id = f.properties?.idedi;
      if (id != null && f.geometry) byId.set(id, f);
    }
    process.stdout.write(`\r  celle ${calls}/${nx * ny}  edifici ${byId.size}`);
    await sleep(350);
  }
}
process.stdout.write('\n');
if (maxInCell >= FEATURE_CAP) console.warn(`  ! una cella ha toccato il tetto di ${FEATURE_CAP}: servono celle piu' piccole`);

const features = [...byId.values()].map((f) => ({
  id: f.properties.idedi,
  piede: f.properties.piede,
  gronda: f.properties.gronda,
  altezza: f.properties.altezza,
  uso: f.properties.desuso,
  geometry: f.geometry,
}));
fs.writeFileSync(OUT, JSON.stringify({ source: 'Regione Veneto CTRN v_edifici via GeoPortale ARPAV (CC BY 3.0)', features }));
const withHeight = features.filter((f) => f.gronda != null && f.piede != null).length;
console.log(`✓ ctrn.json  ${features.length} edifici, ${withHeight} con piede e gronda, massimo ${maxInCell} per cella, ${calls} chiamate`);
