// Who dirties style/layout? Traces a scroll pass (or idle with `idle`) on the
// PRODUCTION build and aggregates style-invalidation / layout-invalidation
// initiators by their JS stack top, plus the heaviest script entry points.
//
//   node scripts/trace.mjs [url] [idle|scroll] [desktop|mobile]
import { chromium } from 'playwright';

const chrome =
  process.env.CHROME
  ?? 'C:\\Users\\sebas\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const url = process.argv[2] ?? 'http://localhost:4173/?shot=1';
const mode = process.argv[3] ?? 'scroll';
const mobile = process.argv[4] === 'mobile';

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
await page.addInitScript(() => { try { localStorage.setItem('hkmodd-theme', 'default'); } catch {} });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3500);

const cdp = await ctx.newCDPSession(page);
const events = [];
cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', {
  categories: [
    'devtools.timeline',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.invalidationTracking',
    'disabled-by-default-devtools.timeline.stack',
  ].join(','),
  transferMode: 'ReportEvents',
});

if (mode === 'idle') {
  await page.waitForTimeout(2000);
} else {
  const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.mouse.move(700, 450);
  for (let y = 0; y < H; y += 100) { await page.mouse.wheel(0, 100); await page.waitForTimeout(16); }
  await page.waitForTimeout(400);
}
await cdp.send('Tracing.end');
await done;

const tally = new Map();
const bump = (k, ms = 0) => {
  const v = tally.get(k) ?? { n: 0, ms: 0 };
  v.n++; v.ms += ms; tally.set(k, v);
};
const top = (st) => {
  if (!st || !st.length) return '(no js stack)';
  return st.slice(0, 3).map((f) => `${f.functionName || '<anon>'}@${(f.url || '').split('/').pop()}:${f.lineNumber}`).join(' < ');
};

let frames = 0;
for (const e of events) {
  const d = e.args?.data;
  if (e.name === 'DrawFrame' || e.name === 'BeginFrame') frames++;
  if (e.name === 'ScheduleStyleRecalculation' || e.name === 'StyleRecalcInvalidationTracking' || e.name === 'StyleInvalidatorInvalidationTracking') {
    bump(`STYLE  ${top(d?.stackTrace)}  [${d?.reason ?? d?.nodeName ?? ''}]`);
  }
  if (e.name === 'InvalidateLayout' || e.name === 'LayoutInvalidationTracking') {
    bump(`LAYOUT ${top(d?.stackTrace)}  [${d?.reason ?? ''} ${d?.nodeName ?? ''}]`);
  }
  if (e.name === 'Layout' && e.dur) bump('·Layout total', e.dur / 1000);
  if (e.name === 'UpdateLayoutTree' && e.dur) bump('·UpdateLayoutTree total', e.dur / 1000);
  if (e.name === 'Paint' && e.dur) bump('·Paint total', e.dur / 1000);
  if (e.name === 'FunctionCall' && e.dur) {
    bump(`JS ${d?.functionName || '<anon>'}@${(d?.url || '').split('/').pop()}:${d?.lineNumber}`, e.dur / 1000);
  }
  if (e.name === 'FireAnimationFrame' && e.dur) bump(`rAF ${top(d?.stackTrace)}`, e.dur / 1000);
}

const rows = [...tally.entries()].sort((a, b) => b[1].n - a[1].n || b[1].ms - a[1].ms).slice(0, 45);
console.log(`mode=${mode} ${mobile ? 'mobile' : 'desktop'} events=${events.length}`);
for (const [k, v] of rows) console.log(String(v.n).padStart(6), v.ms.toFixed(1).padStart(9), 'ms ', k.slice(0, 220));
await browser.close();
