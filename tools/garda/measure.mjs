/**
 * Misura il portale in un browser VISIBILE.
 *
 * Perche' esiste: il pannello di anteprima dell'editor tiene la sua tab
 * nascosta — misurato: `document.visibilityState = 'hidden'` e 0 callback
 * di requestAnimationFrame in 2 secondi. Li' il frame time semplicemente non
 * esiste, e un "5 fps" letto in quelle condizioni e' un artefatto. Qui si
 * apre una finestra vera, con i flag che impediscono a Chromium di
 * rallentare le finestre coperte, e si registra lo stato di visibilita' nel
 * referto: se non e' 'visible', il numero non vale.
 *
 *   node tools/garda/measure.mjs [--url http://localhost:3000/garda.html] [--seconds 8]
 *   node tools/garda/measure.mjs --shots [--only lago]   inquadrature fisse per la taratura artistica
 *
 * Referto in tools/garda/out/measure/report.json, screenshot accanto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const arg = (key, fallback) => {
  const i = args.indexOf(key);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = arg('--url', 'http://localhost:3000/garda.html');
const SHOTS = args.includes('--shots');
const ONLY = arg('--only', null);
const SECONDS = Number(arg('--seconds', '8'));
const WARMUP_MS = 4000; // la prima compilazione delle pipeline TSL non e' frame time
const OUT = path.resolve(import.meta.dirname, 'out', 'measure');
fs.mkdirSync(OUT, { recursive: true });

const FLAGS = [
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
  // Senza questi tre, una finestra coperta da un'altra viene rallentata e
  // la misura dice cose sulla scrivania, non sul portale.
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--window-size=1320,860',
];

/**
 * Candidati per percorso esplicito, non per `channel`.
 *
 * Su questa macchina `channel: 'chrome'` falliva con `spawn UNKNOWN`: il
 * chrome.exe di sistema pesa 78 byte, e' uno stub, non un eseguibile.
 * Playwright 1.62.1 cerca `chromium-1234`, sul disco ci sono 1217 e 1228.
 * Si prendono quelli GIA' installati, dal piu' recente. Niente download.
 * Sotto 1 MB un "chrome.exe" non e' un browser: si scarta.
 */
const MIN_EXE_BYTES = 1024 * 1024;

function candidates() {
  const list = [];
  const push = (name, file) => {
    if (fs.existsSync(file) && fs.statSync(file).size >= MIN_EXE_BYTES) list.push({ name, executablePath: file });
  };
  push('chrome-sistema', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
  push('chrome-sistema-x86', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe');

  const root = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (fs.existsSync(root)) {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      for (const sub of ['chrome-win64', 'chrome-win']) push(d, path.join(root, d, sub, 'chrome.exe'));
    }
  }
  return list;
}

async function launch() {
  const tried = [];
  for (const c of candidates()) {
    try {
      const browser = await chromium.launch({ headless: false, executablePath: c.executablePath, args: FLAGS });
      return { browser, channel: c.name };
    } catch (err) {
      tried.push(`${c.name}: ${String(err.message).split('\n')[0]}`);
    }
  }
  throw new Error(`nessun Chromium avviabile:\n  ${tried.join('\n  ') || '(nessun candidato trovato)'}`);
}

const withParams = (params) => {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

async function scenario(context, { label, params, game, shot }) {
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 240));
    else if (msg.type() === 'warning' || msg.text().startsWith('[garda]')) warnings.push(msg.text().slice(0, 240));
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${String(err.message).slice(0, 240)}`));

  const t0 = Date.now();
  await page.goto(withParams(params), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__garda?.metrics), null, { timeout: 90000 });
  const mountMs = Date.now() - t0;

  if (shot) {
    // Inquadratura fissa: nessun input, nessuna corsa. Stessa immagine a ogni run.
    if (shot.game) {
      await page.evaluate(() => window.__garda.enterGame());
      // Si aspetta la MODALITA', non un tempo: con un'attesa fissa la cattura
      // senza ombre e quella con le ombre inquadravano due direzioni diverse.
      await page.waitForFunction(() => window.__garda.mode === 'gioco', null, { timeout: 15000 });
      await page.waitForTimeout(300);
      await page.evaluate((v) => {
        const g = window.__garda;
        const at = v.roof ? g.highestRoof() : { sx: v.sx, sy: v.sy };
        g.shot(at.sx, at.sy, v.az, v.pitch, v.dist, v.ground === true);
      }, shot);
    }
    await page.waitForTimeout(2500); // ombre a cascate e riflesso si assestano
  } else {
    if (game) {
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(2200); // volo di camera
      await page.keyboard.down('KeyW');
      await page.keyboard.down('ShiftLeft');
    }
    await page.waitForTimeout(WARMUP_MS + SECONDS * 1000);
  }

  const data = await page.evaluate(() => {
    const g = window.__garda;
    const p = g.player?.feet;
    return {
      backend: g.backend,
      mode: g.mode,
      visibility: document.visibilityState,
      metrics: g.metrics(),
      gpu: g.gpuMetrics ? g.gpuMetrics() : null,
      sizes: g.sizes(),
      player: p
        ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), grounded: g.player.grounded, speed: +g.player.speed.toFixed(2) }
        : null,
    };
  });

  if (game) {
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
  }
  const shotFile = path.join(OUT, `${label}.png`);
  await page.screenshot({ path: shotFile });
  await page.close();

  return { label, url: withParams(params), mountMs, ...data, errors, warnings, screenshot: path.relative(process.cwd(), shotFile) };
}

const { browser, channel } = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const PERF = [
  { label: 'plastico-webgpu', params: { backend: 'gpu', gputime: '1' }, game: false },
  { label: 'plastico-webgl2', params: { backend: 'gl', gputime: '1' }, game: false },
  { label: 'gioco-webgpu', params: { backend: 'gpu', gputime: '1' }, game: true },
  { label: 'gioco-webgl2', params: { backend: 'gl', gputime: '1' }, game: true },
];

/**
 * Inquadrature fisse della taratura. `az` e' l'azimut dello SGUARDO in gradi
 * da est, antiorario: la convenzione del sole (206 = ovest-sudovest, sopra il
 * lago). Quindi il controluce e' az 206 per definizione, non per tentativi.
 *
 *   Piazza Calderini (-128, -104), sul porticciolo: verso la Rocca (299),
 *   verso il lago in controluce (206), verso il paese (60).
 *   Tetti: il colmo piu' alto dell'arena.
 *   Lungolago Regina Adelaide (-206, -226), lungo la riva verso nord-ovest.
 *   Rocca: sul versante, verso paese e lago.
 */
const PIAZZA = { game: true, ground: true, sx: -128, sy: -104, pitch: -6, dist: 5.2 };
const SHOT_LIST = [
  { label: 'shot-1-plastico', params: { backend: 'gpu' }, shot: { game: false } },
  { label: 'shot-2-piazza-rocca', params: { backend: 'gpu' }, shot: { ...PIAZZA, az: 299 } },
  { label: 'shot-3-piazza-lago-controluce', params: { backend: 'gpu' }, shot: { ...PIAZZA, az: 206 } },
  { label: 'shot-4-piazza-paese', params: { backend: 'gpu' }, shot: { ...PIAZZA, az: 60 } },
  { label: 'shot-5-tetti', params: { backend: 'gpu' }, shot: { game: true, roof: true, az: 130, pitch: -24, dist: 8 } },
  { label: 'shot-6-lungolago', params: { backend: 'gpu' }, shot: { game: true, ground: true, sx: -206, sy: -226, az: 150, pitch: -4, dist: 6 } },
  { label: 'shot-7-rocca-versante', params: { backend: 'gpu' }, shot: { game: true, ground: true, sx: 150, sy: -620, az: 140, pitch: -12, dist: 7 } },
  // Zona rifinita: da Piazza Catullo verso i moli (ovest), e dalla riva sulla darsena.
  { label: 'riva-1-porto', params: { backend: 'gpu' }, shot: { game: true, ground: true, sx: -330, sy: -95, az: 250, pitch: -6, dist: 6.5 } },
  { label: 'riva-2-darsena', params: { backend: 'gpu' }, shot: { game: true, ground: true, sx: -300, sy: -135, az: 215, pitch: -5, dist: 6.5 } },
  // Il personaggio di fronte: nasce rivolto a nord, quindi lo sguardo va a sud (270).
  { label: 'shot-8-personaggio', params: { backend: 'gpu' }, shot: { game: true, ground: true, sx: -206, sy: -226, az: 270, pitch: 2, dist: 2.6 } },
];
/**
 * `--top`: il modello visto dall'alto in proiezione ortogonale sulla zona
 * rifinita, accanto all'ortofoto dello stesso rettangolo, alla stessa scala.
 * E' la prova: se la riva, il porto e i moli non coincidono, si vede.
 * Uscita: out/ref/modello_riva.png e out/ref/confronto_riva.png.
 */
if (args.includes('--top')) {
  const { ORTO_ZONE: OZ } = await import('./site.config.mjs');
  const REF = path.resolve(import.meta.dirname, 'out', 'ref');
  const vw = 960;
  const vh = Math.round((vw * (OZ.y1 - OZ.y0)) / (OZ.x1 - OZ.x0));
  const topContext = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const page = await topContext.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 240));
  });
  await page.goto(withParams({ backend: 'gpu', shadows: '0' }), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__garda?.metrics), null, { timeout: 90000 });
  await page.evaluate((z) => {
    for (const el of document.querySelectorAll('.garda-hud')) el.style.display = 'none';
    window.__garda.topView(z.x0, z.y0, z.x1, z.y1);
  }, OZ);
  await page.waitForTimeout(3500);
  const model = path.join(REF, 'modello_riva.png');
  await page.screenshot({ path: model });
  const photo = path.join(import.meta.dirname, 'out', 'ref', 'orto_riva.jpg');
  const b64 = (file) => fs.readFileSync(file).toString('base64');
  const compare = await topContext.newPage();
  await compare.setViewportSize({ width: vw * 2 + 12, height: vh + 36 });
  await compare.setContent(
    `<body style="margin:0;background:#111;color:#ddd;font:13px monospace">` +
      `<div style="display:flex;gap:12px"><div><div style="padding:8px">ORTOFOTO 2023 (Regione del Veneto)</div><img src="data:image/jpeg;base64,${b64(photo)}" width="${vw}" height="${vh}"></div>` +
      `<div><div style="padding:8px">MODELLO, vista ortogonale</div><img src="data:image/png;base64,${b64(model)}" width="${vw}" height="${vh}"></div></div></body>`,
  );
  await compare.waitForTimeout(300);
  await compare.screenshot({ path: path.join(REF, 'confronto_riva.png') });
  console.log(`confronto: out/ref/confronto_riva.png  (${vw}x${vh} per lato)  errori ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log(`! ${e}`);
  await browser.close();
  process.exit(0);
}

/**
 * `--isolate`: una sola pagina, un'inquadratura di gioco fissa, e si spegne
 * un sistema alla volta. Il frame time si campiona DENTRO la pagina con
 * requestAnimationFrame per 3 s, non col contatore del portale: a 1-2 fps i
 * suoi 240 campioni coprono minuti e mescolerebbero le condizioni.
 */
if (args.includes('--isolate')) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 240));
  });
  await page.goto(withParams({ backend: arg('--backend', 'gpu') }), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__garda?.metrics), null, { timeout: 90000 });
  await page.evaluate(() => window.__garda.enterGame());
  await page.waitForFunction(() => window.__garda.mode === 'gioco', null, { timeout: 30000 });
  await page.evaluate(() => window.__garda.shot(-206, -226, 150, -4, 6, true));
  await page.waitForTimeout(WARMUP_MS);

  const sample = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const deltas = [];
          const t0 = performance.now();
          let last = t0;
          const tick = (now) => {
            deltas.push(now - last);
            last = now;
            if (now - t0 < 3000 && deltas.length < 2000) requestAnimationFrame(tick);
            else {
              deltas.sort((a, b) => a - b);
              const q = (p) => deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))];
              const info = window.__garda.renderer.info.render;
              resolve({ frames: deltas.length, p50: q(0.5), p95: q(0.95), calls: info.drawCalls ?? info.calls, triangles: info.triangles });
            }
          };
          requestAnimationFrame(tick);
        }),
    );

  const TOGGLES = [
    ['tutto acceso', null],
    ['senza alberi', 'veg'],
    ['senza lago (riflesso)', 'water'],
    ['senza ombre', 'shadow'],
    ['senza alberi, lago, ombre', 'all'],
  ];
  console.log('condizione                     frame  p50 ms   p95 ms   draw  triangoli');
  for (const [label, what] of TOGGLES) {
    await page.evaluate((w) => {
      const { world } = window.__garda;
      const off = (key) => w === key || w === 'all';
      if (world.vegetation) world.vegetation.group.visible = !off('veg');
      world.water.visible = !off('water');
      world.sun.castShadow = !off('shadow');
    }, what);
    await page.waitForTimeout(1500);
    const r = await sample();
    console.log(`${label.padEnd(30)} ${String(r.frames).padStart(5)}  ${r.p50.toFixed(1).padStart(6)}  ${r.p95.toFixed(1).padStart(7)}  ${String(r.calls).padStart(5)}  ${r.triangles}`);
  }
  for (const e of errors.slice(0, 5)) console.log(`! ${e}`);
  await browser.close();
  process.exit(0);
}

const SCENARIOS = (SHOTS ? SHOT_LIST : PERF).filter((s) => !ONLY || s.label.includes(ONLY));

const results = [];
for (const s of SCENARIOS) {
  try {
    results.push(await scenario(context, s));
  } catch (err) {
    results.push({ label: s.label, failed: String(err.message).split('\n')[0] });
  }
}
await browser.close();

const report = { when: new Date().toISOString(), channel, viewport: '1280x720@1', seconds: SECONDS, results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

console.log(`browser: ${channel}   viewport 1280x720   campionamento: ultimi 240 frame`);
console.log('scenario                         backend  vis      p50 ms  p95 ms  p99 ms  fps50  montaggio  errori');
for (const r of results) {
  if (r.failed) {
    console.log(`${r.label.padEnd(32)} FALLITO: ${r.failed}`);
    continue;
  }
  const m = r.metrics;
  console.log(
    `${r.label.padEnd(32)} ${String(r.backend).padEnd(8)} ${r.visibility.padEnd(8)} ` +
      `${m.p50.toFixed(2).padStart(6)}  ${m.p95.toFixed(2).padStart(6)}  ${m.p99.toFixed(2).padStart(6)}  ` +
      `${m.fps50.toFixed(0).padStart(5)}  ${String(r.mountMs).padStart(7)} ms  ${r.errors.length}`,
  );
  if (r.gpu && r.gpu.frames > 0) {
    console.log(`${''.padEnd(32)} GPU  p50 ${r.gpu.p50.toFixed(2)} ms  p95 ${r.gpu.p95.toFixed(2)} ms  p99 ${r.gpu.p99.toFixed(2)} ms  (${r.gpu.frames} campioni)`);
  } else if (r.gpu) {
    console.log(`${''.padEnd(32)} GPU  nessun campione (timestamp query non disponibile su questo backend?)`);
  }
  if (r.player) console.log(`${''.padEnd(32)} personaggio ${JSON.stringify(r.player)}`);
  for (const e of r.errors.slice(0, 3)) console.log(`${''.padEnd(32)} ! ${e}`);
  for (const w of r.warnings.filter((x) => x.includes('[garda]')).slice(0, 3)) console.log(`${''.padEnd(32)} ~ ${w}`);
}
console.log(`\nreferto: ${path.relative(process.cwd(), path.join(OUT, 'report.json'))}`);
