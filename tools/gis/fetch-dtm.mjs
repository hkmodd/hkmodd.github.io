/**
 * Scarica i tile DTM LiDAR 5 m della Regione del Veneto che coprono l'arena.
 *
 * Il portale IDT2 sembra manuale ma sotto ha una REST, trovata ispezionando
 * `ConfiguratorDownloadDtmLidar5` nella pagina di download:
 *
 *   /idt/datiistat/getComuniByProvinciaGS?siglaProvincia=VR
 *   /idt/download/layerDownload/getDtmLidar5ByComune?codComune=..&formatoFile=ZIP
 *   /idt/download/layerDownload/downloadDtmLidar5?dataDtmLidarId=<idPol>
 *
 * Nessuna sessione, nessun cookie.
 *
 * ATTENZIONE: l'elenco "per Comune" e' INCOMPLETO ai bordi. I tile che
 * coprono il margine sud ed est dell'arena appartengono a Bardolino e
 * Costermano. Per questo si interrogano anche i confinanti e si tiene
 * l'unione.
 *
 * Idempotente: non riscarica un tile gia' presente (--force per forzare).
 *
 *   node tools/gis/fetch-dtm.mjs
 *
 * Dati: Regione del Veneto, DTM da rilievi LiDAR (celle 5 m), EPSG:6876.
 * Verificare le condizioni d'uso del portale prima di ridistribuire derivati.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = 'https://idt2.regione.veneto.it/idt';
const OUT = path.resolve(import.meta.dirname, 'cache/dtm');
const FORCE = process.argv.includes('--force');

/** Garda piu' i confinanti che possiedono i tile di bordo. */
const COMUNI = {
  Garda: '23036',
  Bardolino: '23006',
  Costermano: '23030',
  TorriDelBenaco: '23086',
};

/** I tile che servono davvero all'arena, in coordinate fuso 12. */
const NEEDED_X = [2896000, 2898000, 2900000, 2902000];
const NEEDED_Y = [5048000, 5050000];

fs.mkdirSync(OUT, { recursive: true });

async function json(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// 1. unione dei tile di tutti i comuni interessati
const tiles = new Map();
for (const [nome, cod] of Object.entries(COMUNI)) {
  const r = await json(`${BASE}/download/layerDownload/getDtmLidar5ByComune?codComune=${cod}&formatoFile=ZIP`);
  for (const t of r.result.data) {
    if (!tiles.has(t.percorsoFile)) tiles.set(t.percorsoFile, { id: t.idPol, da: nome });
  }
  console.log(`· ${nome.padEnd(16)} ${r.result.data.length} tile`);
}
console.log(`tile distinti: ${tiles.size}`);

// 2. scarico quelli mancanti
let presi = 0, saltati = 0;
for (const [nome, { id, da }] of tiles) {
  const asc = path.join(OUT, `${nome}.asc`);
  if (!FORCE && fs.existsSync(asc) && fs.statSync(asc).size > 1024) {
    saltati++;
    continue;
  }
  const zip = path.join(OUT, `${nome}.asc.zip`);
  const res = await fetch(`${BASE}/download/layerDownload/downloadDtmLidar5?dataDtmLidarId=${id}`);
  if (!res.ok) {
    console.warn(`  ! ${nome} -> HTTP ${res.status}`);
    continue;
  }
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  // unzip di sistema: niente dipendenze npm per un formato che l'OS sa aprire
  execFileSync('unzip', ['-o', '-q', zip, '-d', OUT]);
  console.log(`✓ ${nome}  (${(fs.statSync(zip).size / 1024).toFixed(0)} KB, da ${da})`);
  presi++;
}
console.log(`\nscaricati ${presi}, gia' presenti ${saltati}`);

// 3. la copertura basta per l'arena?
const header = (f) => {
  const txt = fs.readFileSync(f, 'utf8').slice(0, 200);
  const g = (k) => parseFloat(new RegExp(`${k}\\s+(-?[\\d.]+)`, 'i').exec(txt)?.[1]);
  return { x: g('xllcenter') - 2.5, y: g('yllcenter') - 2.5 };
};
const presenti = new Set(
  fs.readdirSync(OUT).filter((f) => f.endsWith('.asc'))
    .map((f) => { const h = header(path.join(OUT, f)); return `${h.x}/${h.y}`; }),
);
const mancanti = [];
for (const x of NEEDED_X) for (const y of NEEDED_Y) if (!presenti.has(`${x}/${y}`)) mancanti.push(`${x}/${y}`);
console.log(mancanti.length
  ? `ATTENZIONE: celle dell'arena senza tile: ${mancanti.join(', ')}`
  : `copertura dell'arena completa: ${NEEDED_X.length * NEEDED_Y.length} celle su ${NEEDED_X.length * NEEDED_Y.length}`);
