/**
 * site.json -> public/garda/garda.nav.json
 *
 * Dati di collisione per il controller in prima persona. NON si raycasta la
 * mesh: i poligoni sorgente ci sono gia', e un point-in-polygon su una griglia
 * di hash costa O(1) contro i 38k triangoli del glTF. Il terreno resta un
 * heightfield bilineare, esattamente lo stesso che ha generato la mesh, quindi
 * il suolo calcolato e il suolo disegnato non possono divergere.
 *
 * Formato: quote e coordinate arrotondate a 2 cm — la stessa precisione della
 * quantizzazione Draco, cosi' i due non litigano.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const HERE = path.resolve(import.meta.dirname);
const site = JSON.parse(fs.readFileSync(path.join(HERE, 'cache', 'site.json'), 'utf8'));
const outPath = path.resolve(HERE, '..', '..', 'public', 'garda', 'garda.nav.json');

/**
 * Quote di colmo misurate da Blender DOPO la costruzione della falda.
 * La formula analitica (gronda + distanza dal bordo * tan) e' esatta su
 * pianta convessa e ottimista su pianta concava, dove l'offset del contorno
 * si spezza in piu' displuvi. Senza questo tetto massimo il giocatore
 * galleggia: misurato fino a 10.0 m sul caso peggiore.
 * Se il file manca (nav lanciato prima di Blender) si prosegue senza clamp.
 */
const measuredPath = path.join(HERE, 'cache', 'roof_measured.json');
const measured = fs.existsSync(measuredPath)
  ? JSON.parse(fs.readFileSync(measuredPath, 'utf8'))
  : {};
if (!Object.keys(measured).length) {
  console.warn('  ! roof_measured.json assente: nessun clamp sui colmi');
}

const q = (v) => Math.round(v * 50) / 50; // passo 2 cm

const T = site.terrain;
const nav = {
  meta: {
    origin: site.meta.bbox,
    attribution: site.meta.attribution,
    levelHeight: site.meta.levelHeight,
    // La pendenza di falda: e' il numero che rende identici il tetto
    // disegnato e il tetto calpestabile.
    roofTan: site.meta.roof.tan,
    arena: site.meta.arena,
  },
  // Il DTM sta a 2.5 m: nel file che scarica il browser si scende a 5 m, che
  // e' la risoluzione nativa del dato regionale. A 2.5 m il file raddoppiava
  // senza aggiungere informazione.
  terrain: (() => {
    const stride = Math.max(1, Math.round(5 / T.step));
    const nx = Math.floor((T.nx - 1) / stride) + 1;
    const ny = Math.floor((T.ny - 1) / stride) + 1;
    const z = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) z.push(Math.round(T.z[j * stride * T.nx + i * stride] * 20) / 20);
    }
    return { nx, ny, step: T.step * stride, x0: q(T.x0), y0: q(T.y0), z };
  })(),
  // Solo cio' che serve a camminarci sopra: sagoma, quota di gronda, quota
  // del piano d'appoggio. Nomi, tag e tipologie restano in site.json.
  // r = sagoma, b = base, e = gronda, i = rientranza di falda (0 = tetto piano).
  // La quota del tetto NON e' memorizzata: si ricalcola come
  // e + min(distanza dal bordo, i) * roofTan, che e' esattamente la regola
  // con cui Blender ha costruito la falda.
  buildings: site.buildings.map((b) => {
    const out = {
      r: b.ring.map(([x, y]) => [q(x), q(y)]),
      b: q(b.base),
      e: q(b.eaves),
      i: b.zone === 'fondale' ? 0 : q(b.inset),
    };
    const ridge = measured[String(b.id)];
    if (ridge !== undefined) out.c = q(ridge);
    return out;
  }),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(nav));

const bytes = fs.statSync(outPath).size;
const zipped = zlib.gzipSync(fs.readFileSync(outPath)).length;
console.log(`garda.nav.json  ${(bytes / 1024).toFixed(0)} KB  (gzip ${(zipped / 1024).toFixed(0)} KB)`);
console.log(`  terreno ${T.nx}x${T.ny} @ ${T.step} m, edifici ${nav.buildings.length}`);
