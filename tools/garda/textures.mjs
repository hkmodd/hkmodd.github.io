/**
 * Texture di Garda, generate qui.
 *
 * Non sono asset scaricati: sono funzioni. Vantaggi che contano su questo
 * progetto — deterministiche (stessa immagine a ogni run, il diff e' vuoto se
 * il codice non cambia), senza licenze da inseguire, e senza cuciture PER
 * COSTRUZIONE, perche' ogni motivo periodico usa frequenze INTERE sul lato
 * della piastrella: il bordo destro combacia col sinistro per algebra, non
 * per ritocco.
 *
 * La MASCHERA DI TINTA sta in una texture propria (`*_m.png`), non nel canale
 * alpha della mappa colore: in alpha ogni visualizzatore la interpreta come
 * trasparenza e la finestra si vede bianca invece che scura — successo, ci ho
 * perso un giro. Bianco = la superficie prende il colore dell'edificio
 * (intonaco), nero = tiene il suo (vetro, persiane, pietra). Cosi' 145 case
 * diverse costano una texture sola. Il mix lo fa `world.ts` con un innesto
 * nello shader.
 *
 *   node textures.mjs      ->  public/garda/tex/*.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { encodePNG } from './png.mjs';

const OUT = path.resolve(import.meta.dirname, '..', '..', 'public', 'garda', 'tex');
fs.mkdirSync(OUT, { recursive: true });

/* ── rumore ──────────────────────────────────────────────────────────────
   Value noise periodico: la griglia si richiude sul lato della piastrella,
   quindi anche il rumore non ha cuciture. */

const hash2 = (x, y, seed = 0) => {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t) => t * t * (3 - 2 * t);

/** Rumore di valore su griglia `period` x `period`, periodico. */
function valueNoise(u, v, period, seed) {
  const x = u * period;
  const y = v * period;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const wrap = (n) => ((n % period) + period) % period;
  const a = hash2(wrap(xi), wrap(yi), seed);
  const b = hash2(wrap(xi + 1), wrap(yi), seed);
  const c = hash2(wrap(xi), wrap(yi + 1), seed);
  const d = hash2(wrap(xi + 1), wrap(yi + 1), seed);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

function fbm(u, v, period, octaves, seed) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u, v, period * 2 ** o, seed + o * 131);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const step01 = (e0, e1, x) => clamp01((x - e0) / (e1 - e0));

/* ── da campo di altezza a normal map ────────────────────────────────────
   Differenze centrali con avvolgimento: il gradiente al bordo legge il lato
   opposto, quindi anche la normale e' periodica.

   La riga 0 di un PNG sta in ALTO, mentre in UV la V cresce verso l'alto:
   qui tutte le texture sono generate con `v = 1 - y/size`, quindi la derivata
   lungo le righe e' l'OPPOSTO della derivata lungo V. Il canale verde va
   negato di conseguenza, o le ombre dei rilievi cadono dalla parte sbagliata
   e nessuno capisce perche' il muro sembra scavato invece che sporgente. */

function heightToNormal(height, size, strength) {
  const out = new Uint8Array(size * size * 3);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 3;
      out[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out[o + 2] = (1 / len) * 0.5 * 255 + 127.5;
    }
  }
  return out;
}

const write = (name, buf) => {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, buf);
  return `${name.padEnd(18)} ${(buf.length / 1024).toFixed(0)} KB`;
};

/* ────────────────────────────────────────────────────────────────────────
   COPPI — 2.4 x 2.4 m
   12 coppie canale+coppo lungo U, 8 corsi lungo V. La V punta a valle:
   le UV del tetto sono ruotate sulla direzione di massima pendenza.
   ──────────────────────────────────────────────────────────────────────── */

function coppi(size = 512) {
  const PAIRS = 12;    // canale + coppo ogni 20 cm
  const COURSES = 8;   // corso ogni 30 cm
  const h = new Float32Array(size * size);
  const rgb = new Uint8Array(size * size * 3);

  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    const cF = v * COURSES;
    const ci = Math.floor(cF);
    const cf = cF - ci;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const pF = u * PAIRS;
      const pi = Math.floor(pF);
      const pf = pF - pi;
      // meta' coppia: 0 = canale (concavo), 1 = coppo (convesso).
      // La variazione di tono va per TEGOLA, non per coppia: indicizzata
      // sulla coppia sola, canale e coppo escono dello stesso colore e il
      // tetto diventa una tenda a righe.
      const half = pf < 0.5 ? 0 : 1;
      const tid = pi * 2 + half;

      // profilo trasversale. Il coppo ha la corona piu' stretta e alta del
      // canale: una cosinusoide pura li fa uguali e il rilievo non si legge.
      const t = half === 0 ? pf * 2 : (pf - 0.5) * 2;   // 0..1 dentro la meta'
      const arc = Math.sin(Math.PI * t);
      const cross = half === 0 ? -0.30 * arc : 0.62 * arc ** 0.75;

      // lo scalino del corso: il calcio del coppo di sopra sta a valle
      const butt = 1 - step01(0.0, 0.07, cf);
      const run = -0.20 * cf;

      const jitterH = (hash2(tid, ci, 7) - 0.5) * 0.09;
      const wear = fbm(u, v, 6, 3, 31);

      h[y * size + x] = cross + butt * 0.34 + run + jitterH + (wear - 0.5) * 0.05;

      // ── colore: neutro caldo. La tinta di cottura arriva dal vertice.
      //
      // L'albedo resta PIATTO di proposito. Il rilievo lo fa la normal map
      // sotto la luce: cuocere anche l'ombra nel colore raddoppia il
      // contrasto e il tetto diventa lamiera ondulata. Qui resta solo
      // l'occlusione che una luce direzionale non puo' produrre da sola.
      // Misurato sulle catture: con contrasto pieno, visti da 3 m i coppi
      // diventavano lamiera ondulata e da lontano moire'. Variazione e
      // occlusione piu' morbide; resta netta solo la linea del corso.
      const tileTone = 0.9 + (hash2(tid, ci, 11) - 0.5) * 0.1;
      const ao = mix(0.84, 1.0, step01(-0.30, 0.45, cross)) *
                 mix(0.66, 1.0, step01(0.0, 0.045, cf));
      // muschio e sporco: si depositano nei canali, non sulle creste
      const grime = clamp01((fbm(u, v, 5, 4, 91) - 0.44) * 2.6) * (half === 0 ? 1 : 0.3);
      let lum = clamp01(mix(tileTone * ao, tileTone * ao * 0.74, grime * 0.85));

      const o = (y * size + x) * 3;
      rgb[o] = lum * 255;
      rgb[o + 1] = lum * 0.982 * 255;
      rgb[o + 2] = lum * 0.948 * 255;
    }
  }
  return {
    color: encodePNG(rgb, size, size, 3),
    normal: encodePNG(heightToNormal(h, size, size * 0.045), size, size, 3),
  };
}

/* ────────────────────────────────────────────────────────────────────────
   INTONACO CON APERTURE — 6.4 x 6.3 m = 2 campate x 2 piani
   La V della facciata parte dal piano terra vero, quindi la fila di finestre
   cade sul solaio. Le quote sono quelle reali: davanzale a 95 cm, foro
   105 x 145 cm, mazzetta in pietra da 8 cm.
   ──────────────────────────────────────────────────────────────────────── */

function intonaco(size = 1024) {
  const BAY_M = 3.2;
  const FLOOR_M = 3.15;
  const h = new Float32Array(size * size);
  const rgb = new Uint8Array(size * size * 3);
  const msk = new Uint8Array(size * size * 3);

  // quote in frazione di campata / piano
  const WIN_W = 1.05 / BAY_M;
  const WIN_X0 = 0.5 - WIN_W / 2;
  const WIN_X1 = 0.5 + WIN_W / 2;
  const WIN_Y0 = 0.95 / FLOOR_M;
  const WIN_Y1 = (0.95 + 1.45) / FLOOR_M;
  const JAMB = 0.08 / BAY_M;
  const JAMB_V = 0.08 / FLOOR_M;

  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    const fF = v * 2; // 2 piani
    const fi = Math.floor(fF);
    const cv = fF - fi;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const bF = u * 2; // 2 campate
      const bi = Math.floor(bF);
      const cu = bF - bi;

      // ── intonaco di base
      //
      // Prima taratura: rumore grosso ±7%, fine ±3.5%, scrostature -20%.
      // Misurato sulle catture da 3 m: la parete sembrava sporca di fuliggine,
      // non vecchia. A quella distanza un intonaco a calce si legge come un
      // velo quasi uniforme; la variazione vera la fa la luce radente, cioe'
      // la normal map, non l'albedo.
      const coarse = fbm(u, v, 5, 4, 3);
      const fine = fbm(u, v, 14, 2, 17);
      let lum = 0.91 + (coarse - 0.5) * 0.06 + (fine - 0.5) * 0.035;
      // scrostature: zone appena piu' calde e scure, non macchie
      const patch = clamp01((fbm(u, v, 3, 4, 55) - 0.58) * 4);
      lum = mix(lum, lum * 0.93, patch);
      let height = (coarse - 0.5) * 0.05 + (fine - 0.5) * 0.03 - patch * 0.06;
      let mask = 1;
      // canale G della maschera: 1 = vetro. Lo shader ci mette il riflesso
      // del cielo; senza, ogni finestra e' un foro nero.
      let glass = 0;
      let col = [lum, lum, lum];

      // ── apertura
      const cell = hash2(bi, fi, 41);
      const shuttered = cell > 0.45;
      const inWin = cu > WIN_X0 && cu < WIN_X1 && cv > WIN_Y0 && cv < WIN_Y1;
      const inJamb =
        cu > WIN_X0 - JAMB && cu < WIN_X1 + JAMB &&
        cv > WIN_Y0 - JAMB_V && cv < WIN_Y1 + JAMB_V;

      // davanzale: sporge oltre la mazzetta, spessore 6 cm
      const SILL_Y1 = WIN_Y0;
      const SILL_Y0 = WIN_Y0 - 0.06 / FLOOR_M;
      const inSill = cu > WIN_X0 - JAMB * 1.8 && cu < WIN_X1 + JAMB * 1.8 && cv > SILL_Y0 && cv < SILL_Y1;

      if (inWin) {
        if (shuttered) {
          // persiana: lamelle orizzontali, colore proprio (mask 0)
          const louver = Math.sin((cv - WIN_Y0) / (WIN_Y1 - WIN_Y0) * Math.PI * 2 * 18);
          const shade = 0.55 + louver * 0.16;
          const wood = hash2(bi, fi, 61) > 0.5 ? [0.20, 0.30, 0.22] : [0.30, 0.24, 0.17];
          col = wood.map((c) => clamp01(c * shade * 2.0));
          // battuta centrale fra le due ante
          if (Math.abs(cu - 0.5) < 0.006) col = col.map((c) => c * 0.55);
          height = -0.35 + louver * 0.05;
          mask = 0;
        } else {
          // vetro: scuro, con un accenno di riflesso del cielo in alto
          const sky = step01(WIN_Y1 - 0.32 * (WIN_Y1 - WIN_Y0), WIN_Y1, cv);
          const g = mix(0.055, 0.20, sky);
          col = [g * 0.85, g * 0.95, g * 1.12];
          // traversi del serramento
          const bar = Math.abs(cu - 0.5) < 0.008 || Math.abs(cv - (WIN_Y0 + WIN_Y1) / 2) < 0.006;
          if (bar) col = [0.62, 0.60, 0.56];
          height = -0.55;
          mask = 0;
          glass = bar ? 0 : 1;
        }
      } else if (inSill) {
        // Pietra: NIENTE tinta dell'edificio. Prima taratura maschera 0.25-0.30:
        // pietra chiara per ocra dava un bordo arancione acceso attorno a ogni
        // finestra, che sulle catture in ombra si leggeva come un difetto.
        const stone = 0.78 + (fbm(u, v, 40, 2, 77) - 0.5) * 0.08;
        col = [stone, stone * 0.975, stone * 0.93];
        height = 0.30;
        mask = 0;
      } else if (inJamb) {
        const stone = 0.84 + (fbm(u, v, 30, 2, 71) - 0.5) * 0.08;
        col = [stone, stone * 0.975, stone * 0.935];
        height = 0.12;
        mask = 0;
      }

      // ── marcapiano: una fascia sottile alla quota di solaio
      if (cv < 0.022) {
        const band = 1 - step01(0.0, 0.022, cv);
        col = col.map((c) => mix(c, c * 0.88, band * 0.7));
        height += band * 0.10;
      }

      h[y * size + x] = height;
      const o = (y * size + x) * 3;
      rgb[o] = clamp01(col[0]) * 255;
      rgb[o + 1] = clamp01(col[1]) * 255;
      rgb[o + 2] = clamp01(col[2]) * 255;
      const m = clamp01(mask) * 255;
      msk[o] = m;
      msk[o + 1] = glass * 255;
      msk[o + 2] = m;
    }
  }
  return {
    color: encodePNG(rgb, size, size, 3),
    mask: encodePNG(msk, size, size, 3),
    normal: encodePNG(heightToNormal(h, size, size * 0.030), size, size, 3),
  };
}

/* ────────────────────────────────────────────────────────────────────────
   SELCIATO — 3 x 3 m, per strade e piazze. A 256 px: e' quasi sempre
   guardato da lontano, e la sua normal map ad alta frequenza era il file
   piu' pesante di tutti (588 KB contro i 99 dei coppi).
   ──────────────────────────────────────────────────────────────────────── */

function selciato(size = 256) {
  const CELLS = 10; // ~30 cm per ciottolo
  const h = new Float32Array(size * size);
  const rgb = new Uint8Array(size * size * 3);

  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // celle di Worley periodiche: il ciottolo e' la distanza al seme
      const gx = Math.floor(u * CELLS);
      const gy = Math.floor(v * CELLS);
      let d1 = 9;
      let d2 = 9;
      let owner = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ((gx + ox) % CELLS + CELLS) % CELLS;
          const cy = ((gy + oy) % CELLS + CELLS) % CELLS;
          const px = (gx + ox + hash2(cx, cy, 5)) / CELLS;
          const py = (gy + oy + hash2(cx, cy, 6)) / CELLS;
          const dd = Math.hypot(u - px, v - py);
          if (dd < d1) {
            d2 = d1;
            d1 = dd;
            owner = cy * CELLS + cx;
          } else if (dd < d2) d2 = dd;
        }
      }
      const edge = step01(0.0, 0.020, d2 - d1); // 0 sulla fuga
      const dome = step01(0.0, 0.055, d2 - d1);
      // Prima taratura: fuga a 0.42 e ±11% fra ciottoli. A livello d'occhio
      // la fuga nera disegnava crepe, non pietre posate. Fuga chiara di
      // sabbia, pietre piu' simili fra loro.
      const tone = 0.55 + (hash2(owner % CELLS, (owner / CELLS) | 0, 13) - 0.5) * 0.14;
      const grit = fbm(u, v, 16, 2, 5);
      let lum = tone * mix(0.7, 1.0, edge) * (0.93 + grit * 0.14);
      h[y * size + x] = dome * 0.5 + (grit - 0.5) * 0.04;
      const o = (y * size + x) * 3;
      lum = clamp01(lum);
      rgb[o] = lum * 255;
      rgb[o + 1] = lum * 0.99 * 255;
      rgb[o + 2] = lum * 0.96 * 255;
    }
  }
  return {
    color: encodePNG(rgb, size, size, 3),
    normal: encodePNG(heightToNormal(h, size, size * 0.045), size, size, 3),
  };
}

/* ────────────────────────────────────────────────────────────────────────
   RUMORE — 256 px, tre ottave indipendenti in R, G, B. E' un DATO, non un
   colore: lo shader lo campiona in coordinate mondo a scale diverse per
   spezzare le campiture del suolo, increspare il lago, muovere la schiuma.
   ──────────────────────────────────────────────────────────────────────── */

function rumore(size = 256) {
  const rgb = new Uint8Array(size * size * 3);
  // fbm di value noise sta quasi tutto fra 0.3 e 0.7: si stira attorno a
  // 0.5, altrimenti ogni soglia nello shader lavora su un gradino di 40 livelli
  const stretch = (f) => clamp01((f - 0.5) * 1.7 + 0.5) * 255;
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const o = (y * size + x) * 3;
      rgb[o] = stretch(fbm(u, v, 4, 4, 201));
      rgb[o + 1] = stretch(fbm(u, v, 8, 3, 307));
      rgb[o + 2] = stretch(fbm(u, v, 16, 3, 409));
    }
  }
  return encodePNG(rgb, size, size, 3);
}

const t0 = Date.now();
const c = coppi();
const i = intonaco();
const s = selciato();
const r = rumore();
const lines = [
  write('coppi_c.png', c.color),
  write('coppi_n.png', c.normal),
  write('intonaco_c.png', i.color),
  write('intonaco_m.png', i.mask),
  write('intonaco_n.png', i.normal),
  write('selciato_c.png', s.color),
  write('selciato_n.png', s.normal),
  write('rumore.png', r),
];
const total = [c.color, c.normal, i.color, i.mask, i.normal, s.color, s.normal, r]
  .reduce((a, b) => a + b.length, 0);
lines.push(`${'TOTALE'.padEnd(18)} ${(total / 1024).toFixed(0)} KB`);
console.log(lines.join('\n'));
console.log(`\ncoppi 2.4 m · intonaco 6.4 x 6.3 m (2 campate x 2 piani) · selciato 3 m`);
console.log(`generate in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
