import { chromium, firefox } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const chrome =
  process.env.CHROME
  ?? 'C:\\Users\\sebas\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const ff =
  process.env.FIREFOX
  ?? 'C:\\Users\\sebas\\AppData\\Local\\ms-playwright\\firefox-1511\\firefox\\firefox.exe';
const url = process.argv[2] ?? 'http://127.0.0.1:3000/?shot=1';
const out = resolve(process.argv[3] ?? 'tmp/hero-desktop.png');
const flags = new Set(process.argv.slice(4));
const engine = flags.has('ff') ? 'firefox' : 'chromium';
const reduced = flags.has('reduced');

await mkdir(resolve(out, '..'), { recursive: true });

const browser =
  engine === 'firefox'
    ? await firefox.launch({ executablePath: ff, headless: true })
    : await chromium.launch({
        executablePath: chrome,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--ignore-gpu-blocklist',
          '--enable-webgl',
          '--enable-unsafe-swiftshader',
          '--use-gl=angle',
          '--use-angle=swiftshader',
        ],
      });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
if (engine !== 'firefox') {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
}
await page.addInitScript(() => {
  try { localStorage.setItem('hkmodd-theme', 'default'); } catch {}
});
const bust = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
await page.goto(bust, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#hero', { timeout: 20000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
