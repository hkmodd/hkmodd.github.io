// Correctness smoke test of the PRODUCTION build, both neural backends.
//
//   node scripts/verify.mjs [origin]
//
// Loads the page with the lock skipped on the WebGL path and on the WebGPU
// path, collects console errors/warnings (the GPU path demotes itself to GL
// with a console.warn on any failure), opens the telemetry HUD to read the
// live backend, and writes one screenshot per path to tmp/.
import { chromium } from 'playwright';

const chrome =
  process.env.CHROME
  ?? 'C:\\Users\\sebas\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const origin = process.argv[2] ?? 'http://localhost:4173';

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-webgpu'],
});

let failed = false;
for (const engine of ['gl', 'gpu']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`);
  });
  await page.addInitScript(() => { try { localStorage.setItem('hkmodd-theme', 'default'); } catch {} });
  await page.goto(`${origin}/?shot=1&neural=${engine}`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(600);
  const hud = await page.evaluate(() => document.body.innerText.match(/(webgpu[\w:-]*|wasm-[\w]+)/i)?.[0] ?? 'n/a');
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tmp/verify-${engine}.png` });
  const bad = logs.filter((l) => !/DevTools|favicon/i.test(l));
  if (bad.length) failed = true;
  console.log(JSON.stringify({ engine, backend: hud, logs: bad }));
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
