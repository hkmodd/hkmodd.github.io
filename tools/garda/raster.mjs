/**
 * Controllo visivo del modello di sito: hillshade del terreno + sedimi
 * colorati per altezza + strade + acqua, 1 px = 1 m, nord in alto.
 *
 * Serve a guardare i dati invece di dedurli. Non e' un asset del gioco.
 *
 *   node raster.mjs [out.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CACHE = path.resolve(import.meta.dirname, 'cache');
const site = JSON.parse(fs.readFileSync(path.join(CACHE, 'site.json'), 'utf8'));
const out = process.argv[2] ?? path.join(CACHE, 'site.png');

const T = site.terrain;
const M = site.meta.metric;
const W = Math.round(M.width);
const H = Math.round(M.depth);

const buf = Buffer.alloc(W * H * 3);

/** pixel -> mondo. y cresce a nord, il raster cresce a sud. */
const wx = (px) => M.x0 + px + 0.5;
const wy = (py) => M.y1 - py - 0.5;

function zAt(x, y) {
  const fx = Math.min(T.nx - 1.001, Math.max(0, (x - T.x0) / T.step));
  const fy = Math.min(T.ny - 1.001, Math.max(0, (y - T.y0) / T.step));
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const g = (i, j) => T.z[j * T.nx + i];
  return (
    g(ix, iy) * (1 - tx) * (1 - ty) +
    g(ix + 1, iy) * tx * (1 - ty) +
    g(ix, iy + 1) * (1 - tx) * ty +
    g(ix + 1, iy + 1) * tx * ty
  );
}

const zs = T.z;
const zMin = Math.min(...zs);
const zMax = Math.max(...zs);

const set = (px, py, r, g, b) => {
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  const o = (py * W + px) * 3;
  buf[o] = r;
  buf[o + 1] = g;
  buf[o + 2] = b;
};

/* --- hillshade: sole da NW a 45 gradi, piu' ipsometria fredda --- */
const LX = -0.5;
const LY = 0.5;
const LZ = 0.7071;
const LN = Math.hypot(LX, LY, LZ);

for (let py = 0; py < H; py++) {
  const y = wy(py);
  for (let px = 0; px < W; px++) {
    const x = wx(px);
    const z = zAt(x, y);
    const d = 6;
    const dzdx = (zAt(x + d, y) - zAt(x - d, y)) / (2 * d);
    const dzdy = (zAt(x, y + d) - zAt(x, y - d)) / (2 * d);
    // normale = (-dzdx, -dzdy, 1)
    const nl = Math.hypot(dzdx, dzdy, 1);
    let lam = (-dzdx * LX - dzdy * LY + LZ) / (nl * LN);
    lam = Math.max(0, lam);
    const t = (z - zMin) / (zMax - zMin);
    // basso = ardesia fredda, alto = bruno chiaro
    const base = [26 + 150 * t, 32 + 140 * t, 44 + 110 * t];
    const k = 0.35 + 0.85 * lam;
    set(px, py, Math.min(255, base[0] * k), Math.min(255, base[1] * k), Math.min(255, base[2] * k));
  }
}

/* --- riempimento poligoni (scanline, even-odd) --- */
function fillRing(ring, rgb, alpha = 1) {
  let minY = Infinity;
  let maxY = -Infinity;
  const pts = ring.map(([x, y]) => [x - M.x0, M.y1 - y]); // in pixel-space
  for (const [, py] of pts) {
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let py = y0; py <= y1; py++) {
    const yc = py + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if (ay === by) continue;
      if (yc >= Math.min(ay, by) && yc < Math.max(ay, by)) {
        xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const sx = Math.max(0, Math.ceil(xs[k]));
      const ex = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let px = sx; px <= ex; px++) {
        if (alpha >= 1) {
          set(px, py, rgb[0], rgb[1], rgb[2]);
        } else {
          const o = (py * W + px) * 3;
          buf[o] = buf[o] * (1 - alpha) + rgb[0] * alpha;
          buf[o + 1] = buf[o + 1] * (1 - alpha) + rgb[1] * alpha;
          buf[o + 2] = buf[o + 2] * (1 - alpha) + rgb[2] * alpha;
        }
      }
    }
  }
}

function line(ax, ay, bx, by, width, rgb) {
  const x0 = ax - M.x0;
  const y0 = M.y1 - ay;
  const x1 = bx - M.x0;
  const y1 = M.y1 - by;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len));
  const r = Math.max(0.5, width / 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        set(Math.round(cx + dx), Math.round(cy + dy), rgb[0], rgb[1], rgb[2]);
      }
    }
  }
}

/* --- acqua --- */
for (const w of site.water) fillRing(w.ring, [8, 22, 40], 0.85);

/* --- strade --- */
for (const r of site.roads) {
  const minor = r.kind === 'footway' || r.kind === 'path' || r.kind === 'steps';
  const rgb = minor ? [120, 128, 138] : [186, 192, 200];
  for (let i = 0; i + 1 < r.pts.length; i++) {
    line(r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1], r.width, rgb);
  }
}

/* --- edifici: ciano = basso, magenta = alto (palette del sito) --- */
const hMin = 3;
const hMax = 16;
for (const b of site.buildings) {
  const t = Math.max(0, Math.min(1, (b.height - hMin) / (hMax - hMin)));
  const rgb = [Math.round(34 + 200 * t), Math.round(211 - 130 * t), Math.round(238 - 60 * t)];
  fillRing(b.ring, rgb, 1);
  // bordo scuro: senza, il tessuto contiguo diventa una macchia sola
  for (let i = 0; i < b.ring.length; i++) {
    const a = b.ring[i];
    const c = b.ring[(i + 1) % b.ring.length];
    line(a[0], a[1], c[0], c[1], 1, [12, 14, 20]);
  }
}

/* --- poi --- */
for (const p of site.pois) {
  const px = Math.round(p.x - M.x0);
  const py = Math.round(M.y1 - p.y);
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 4 || d < 2.4) continue;
      set(px + dx, py + dy, 255, 240, 120);
    }
  }
}

/* --- PNG --- */
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
fs.writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);

console.log(`${out}  ${W}x${H} px  (1 px = 1 m)  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
console.log(`z ${zMin.toFixed(1)}..${zMax.toFixed(1)} m   edifici ${site.buildings.length}   strade ${site.roads.length}`);
