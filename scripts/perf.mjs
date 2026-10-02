// Frame-budget benchmark for the PRODUCTION build (npm run build && npm run preview).
//
//   node scripts/perf.mjs [url] [profile]
//     profile: desktop (default) | mobile  — mobile = 390x844, DPR 3, touch, CPU 4x throttle
//
// Loads the page with the lock skipped (?shot=1), records load metrics, then
// wheel-scrolls the whole page top→bottom→top while sampling every rAF delta.
// Reports frame percentiles, jank share, long tasks, and the style/layout work
// Chromium did during the scroll. Real GPU (ANGLE d3d11), not SwiftShader.
import { chromium } from 'playwright';

const chrome =
  process.env.CHROME
  ?? 'C:\\Users\\sebas\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const url = process.argv[2] ?? 'http://localhost:4173/?shot=1';
const profile = process.argv[3] ?? 'desktop';
const mobile = profile === 'mobile';

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-gpu-rasterization'],
});
const ctx = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } },
);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.addInitScript(() => {
  try { localStorage.setItem('hkmodd-theme', 'default'); } catch {}
  const w = window;
  w.__lt = [];
  w.__lcp = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push(e.duration); })
    .observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lcp = e.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true });
});

let bytes = 0;
page.on('response', async (r) => {
  const len = Number(r.headers()['content-length'] ?? 0);
  bytes += len;
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
const loadMs = Date.now() - t0;
await page.waitForTimeout(3000); // boot reveal + lazy sections + engine warmup

const load = await page.evaluate(() => {
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
  const tbt = window.__lt.reduce((s, d) => s + Math.max(0, d - 50), 0);
  return { fcp: Math.round(fcp), lcp: Math.round(window.__lcp), tbtBoot: Math.round(tbt) };
});

const metric = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
};

// Idle frames with nothing happening (background sim only).
const idle = await page.evaluate(() => new Promise((res) => {
  const d = []; let last = performance.now(); const end = last + 3000;
  const f = (t) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(d); };
  requestAnimationFrame(f);
}));

await page.evaluate(() => { window.__lt.length = 0; });
const m0 = await metric();
const framesP = page.evaluate(() => new Promise((res) => {
  const d = []; let last = performance.now();
  window.__stopFrames = () => res(d);
  const f = (t) => { d.push(t - last); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
}));

const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const step = mobile ? 60 : 100;
await page.mouse.move(700, 450);
for (let y = 0; y < H; y += step) { await page.mouse.wheel(0, step); await page.waitForTimeout(16); }
await page.waitForTimeout(600);
for (let y = H; y > 0; y -= step * 2) { await page.mouse.wheel(0, -step * 2); await page.waitForTimeout(16); }
await page.waitForTimeout(600);

await page.evaluate(() => window.__stopFrames());
const frames = await framesP;
const m1 = await metric();
const longTasks = await page.evaluate(() => window.__lt.slice());

const stats = (arr) => {
  const a = arr.slice(1).sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))].toFixed(1);
  const jank = a.filter((x) => x > 20).length;
  return { n: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a[a.length - 1].toFixed(1), jank: `${((jank / a.length) * 100).toFixed(1)}%` };
};

const d = (k) => +(m1[k] - m0[k]).toFixed(3);
console.log(JSON.stringify({
  profile, loadMs, bytes, ...load,
  idle: stats(idle),
  scroll: stats(frames),
  scrollPx: H,
  longTasks: longTasks.length,
  longTaskMs: Math.round(longTasks.reduce((s, x) => s + x, 0)),
  layouts: d('LayoutCount'), styleRecalcs: d('RecalcStyleCount'),
  layoutMs: Math.round(d('LayoutDuration') * 1000), styleMs: Math.round(d('RecalcStyleDuration') * 1000),
  scriptMs: Math.round(d('ScriptDuration') * 1000), taskMs: Math.round(d('TaskDuration') * 1000),
  heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1), nodes: m1.Nodes,
}, null, 2));
await browser.close();
