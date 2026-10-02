// Frame budget of the lock screen: trace the bolt with a real pointer drag,
// let it open, and sample every rAF from first contact to 1.5 s after the
// strike — the window where the page mounts behind a running animation.
//
//   node scripts/perf-lock.mjs [url] [desktop|mobile] [shot.png]
import { chromium } from 'playwright';

const chrome =
  process.env.CHROME
  ?? 'C:\\Users\\sebas\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const url = process.argv[2] ?? 'http://localhost:4173/';
const mobile = process.argv[3] === 'mobile';
const shot = process.argv[4];

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'],
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
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); })
    .observe({ type: 'longtask', buffered: true });
  window.__loaf = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__loaf.push({
          at: Math.round(e.startTime), dur: Math.round(e.duration),
          style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
          scripts: e.scripts.map((s) => `${s.invoker} ${s.sourceFunctionName}@${(s.sourceURL || '').split('/').pop()} ${Math.round(s.duration)}ms`),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {}
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.lock');
await page.waitForTimeout(1500);

// Spine in client coordinates, sampled finely.
const pts = await page.evaluate(() => {
  const spine = document.querySelector('.lock [data-spine]') ?? document.querySelector('.lock path[stroke="none"]');
  const svg = spine.ownerSVGElement;
  const m = svg.getScreenCTM();
  const L = spine.getTotalLength();
  const out = [];
  for (let i = 0; i <= 60; i++) {
    const q = spine.getPointAtLength((L * i) / 60);
    out.push({ x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f });
  }
  return out;
});

await page.evaluate(() => {
  window.__lt.length = 0;
  window.__loaf.length = 0;
  window.__t0 = performance.now();
  const d = []; let last = performance.now();
  window.__frames = d;
  const f = (t) => { d.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
const m0 = (await cdp.send('Performance.getMetrics')).metrics;

await page.mouse.move(pts[0].x, pts[0].y);
await page.mouse.down();
for (const [i, p] of pts.entries()) {
  await page.mouse.move(p.x, p.y, { steps: 2 });
  if (shot && i === 34) await page.screenshot({ path: shot.replace('.png', '-mid.png') });
  if (shot && i === 53) { await page.waitForTimeout(90); await page.screenshot({ path: shot.replace('.png', '-strike.png') }); }
}
const dragFrames = await page.evaluate(() => window.__frames.length);
await page.mouse.up();
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__stop = true; });

const frames = await page.evaluate(() => window.__frames.slice(1));
const lt = await page.evaluate(() => window.__lt.slice());
const loaf = await page.evaluate(() => window.__loaf.filter((e) => e.dur > 30).map((e) => ({ ...e, at: e.at - Math.round(window.__t0) })));
const m1 = (await cdp.send('Performance.getMetrics')).metrics;
const g = (ms, k) => ms.find((m) => m.name === k).value;
const stats = (a0) => {
  const a = a0.slice().sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))].toFixed(1);
  return { n: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a[a.length - 1].toFixed(1), over20: a.filter((x) => x > 20).length };
};
const opened = await page.evaluate(() => !document.querySelector('.lock'));
console.log(JSON.stringify({
  profile: mobile ? 'mobile' : 'desktop',
  opened,
  drag: stats(frames.slice(0, dragFrames)),
  strike: stats(frames.slice(dragFrames)),
  longTasks: lt.map((x) => Math.round(x)),
  loaf,
  styleMs: Math.round((g(m1, 'RecalcStyleDuration') - g(m0, 'RecalcStyleDuration')) * 1000),
  layoutMs: Math.round((g(m1, 'LayoutDuration') - g(m0, 'LayoutDuration')) * 1000),
  scriptMs: Math.round((g(m1, 'ScriptDuration') - g(m0, 'ScriptDuration')) * 1000),
}, null, 1));
if (shot) await page.screenshot({ path: shot });
await browser.close();
