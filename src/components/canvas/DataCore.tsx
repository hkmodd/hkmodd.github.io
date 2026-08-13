import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * ARMILLA — a painted armillary reliquary.
 * One 2D canvas, full 3D projection. No second WebGL context.
 * Icosahedral lattice + three inscribed armillae + shader-faithful
 * plasma core (the original fresnel + layered-sine field, now in ImageData).
 */

const PHI = (1 + Math.sqrt(5)) / 2;

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function themeHex(theme: string): string {
  return theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
}

const RAW: [number, number, number][] = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
];
const INV = 1 / Math.hypot(0, 1, PHI);
const VERTS: [number, number, number][] = RAW.map(([x, y, z]) => [x * INV, y * INV, z * INV]);

const EDGES: [number, number][] = [];
for (let i = 0; i < 12; i++) {
  for (let j = i + 1; j < 12; j++) {
    const d = Math.hypot(
      RAW[i][0] - RAW[j][0],
      RAW[i][1] - RAW[j][1],
      RAW[i][2] - RAW[j][2],
    );
    if (d < 2.1) EDGES.push([i, j]);
  }
}

const RING_N = 80;
const RING_TILTS: [number, number, number][] = [
  [0, 0, 0],
  [0.95, 0.15, 0.35],
  [-0.72, 0.55, -0.4],
];

type Pt = { x: number; y: number; z: number; s: number; px: number; py: number };

function rotate(x: number, y: number, z: number, ax: number, ay: number): [number, number, number] {
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

function project(x: number, y: number, z: number, f: number, cx: number, cy: number, scale: number): Pt {
  const s = f / (f + z);
  return { x, y, z, s, px: cx + x * s * scale, py: cy + y * s * scale };
}

function paintPlasma(
  img: ImageData,
  t: number,
  rgb: [number, number, number],
  intensity: number,
) {
  const { data, width, height } = img;
  const [cr, cg, cb] = rgb;
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const R = Math.min(cx, cy) * 0.98;
  for (let j = 0; j < height; j++) {
    const ny = (j - cy) / R;
    for (let i = 0; i < width; i++) {
      const nx = (i - cx) / R;
      const r2 = nx * nx + ny * ny;
      const o = (j * width + i) * 4;
      if (r2 > 1) {
        data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
        continue;
      }
      const z = Math.sqrt(1 - r2);
      const fres = (1 - z) * (1 - z);
      let e = Math.sin(t * 2.5 + ny * 5.0) * 0.5 + 0.5;
      e *= Math.sin(t * 1.7 + nx * 4.0) * 0.5 + 0.5;
      e *= Math.sin(t * 0.9 + z * 6.0 + nx * ny * 8) * 0.35 + 0.75;
      const ir = cr * (0.28 + e * 0.62);
      const ig = cg * (0.28 + e * 0.62);
      const ib = cb * (0.28 + e * 0.62);
      const rr = cr * (1.55 + fres * 2.4);
      const rg = cg * (1.55 + fres * 2.4);
      const rb = cb * (1.55 + fres * 2.4);
      data[o] = Math.min(255, ir + (rr - ir) * fres);
      data[o + 1] = Math.min(255, ig + (rg - ig) * fres);
      data[o + 2] = Math.min(255, ib + (rb - ib) * fres);
      data[o + 3] = Math.min(255, (0.55 + fres * 0.45) * intensity * 255);
    }
  }
}

export default function DataCore() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const reducedData = useAppStore((s) => s.reducedData);

  useEffect(() => {
    if (reducedMotion || reducedData) return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const hover = { current: false };
    const ptr = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0 };
    const color = { r: 0, g: 212, b: 255 };
    let visible = false;
    let raf = 0;
    let t0 = performance.now();
    let elapsed = 0;
    let plasma: ImageData | null = null;
    let plasmaSize = 96;

    const onEnter = () => { hover.current = true; };
    const onLeave = () => { hover.current = false; };
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    };

    const resize = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 1.75);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      plasmaSize = coarse ? 72 : 112;
      plasma = ctx.createImageData(plasmaSize, plasmaSize);
    };

    const drawRing = (
      ax: number, ay: number,
      radius: number,
      rotA: [number, number],
      segs: number,
      rgb: [number, number, number],
      alpha: number,
      ticks: boolean,
      f: number, cx: number, cy: number, scale: number,
    ) => {
      const [rax, ray] = rotA;
      const pts: Pt[] = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        let x = Math.cos(a) * radius;
        let y = 0;
        let z = Math.sin(a) * radius;
        const c1 = Math.cos(ax);
        const s1 = Math.sin(ax);
        const y2 = y * c1 - z * s1;
        const z2 = y * s1 + z * c1;
        const c2 = Math.cos(ay);
        const s2 = Math.sin(ay);
        const x3 = x * c2 + z2 * s2;
        const z3 = -x * s2 + z2 * c2;
        const [rx, ry, rz] = rotate(x3, y2, z3, rax, ray);
        pts.push(project(rx, ry, rz, f, cx, cy, scale));
      }

      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        if (p.z < -0.02) { started = false; continue; }
        if (!started) { ctx.moveTo(p.px, p.py); started = true; }
        else ctx.lineTo(p.px, p.py);
      }
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      ctx.lineWidth = 1.05;
      ctx.stroke();

      ctx.beginPath();
      started = false;
      for (const p of pts) {
        if (p.z >= -0.02) { started = false; continue; }
        if (!started) { ctx.moveTo(p.px, p.py); started = true; }
        else ctx.lineTo(p.px, p.py);
      }
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.28})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();

      if (!ticks) return;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const inner = radius * (i % 6 === 0 ? 0.93 : 0.965);
        const mk = (rad: number): [number, number, number] => {
          let x = Math.cos(a) * rad;
          let y = 0;
          let z = Math.sin(a) * rad;
          const c1 = Math.cos(ax);
          const s1 = Math.sin(ax);
          const y2 = y * c1 - z * s1;
          const z2 = y * s1 + z * c1;
          const c2 = Math.cos(ay);
          const s2 = Math.sin(ay);
          return [x * c2 + z2 * s2, y2, -x * s2 + z2 * c2];
        };
        const [ix, iy, iz] = rotate(...mk(inner), rax, ray);
        const [ox, oy, oz] = rotate(...mk(radius * 1.012), rax, ray);
        const A = project(ix, iy, iz, f, cx, cy, scale);
        const B = project(ox, oy, oz, f, cx, cy, scale);
        ctx.beginPath();
        ctx.moveTo(A.px, A.py);
        ctx.lineTo(B.px, B.py);
        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${oz > 0 ? alpha * 0.85 : alpha * 0.22})`;
        ctx.lineWidth = i % 6 === 0 ? 1.3 : 0.7;
        ctx.stroke();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;

      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      elapsed += dt;

      const theme = useAppStore.getState().theme;
      const target = hexRgb(themeHex(theme));
      color.r += (target[0] - color.r) * 0.08;
      color.g += (target[1] - color.g) * 0.08;
      color.b += (target[2] - color.b) * 0.08;
      const rgb: [number, number, number] = [color.r, color.g, color.b];
      const light = theme === 'light';

      const speed = hover.current ? 1.15 : 0.38;
      const ay = elapsed * speed;
      const ax = Math.sin(elapsed * 0.31) * 0.22;
      const tTilt = hover.current ? 0.14 : 0.07;
      tilt.x += (ptr.y * tTilt - tilt.x) * 0.08;
      tilt.y += (ptr.x * tTilt - tilt.y) * 0.08;
      const rotA: [number, number] = [ax + tilt.x, ay + tilt.y];

      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const cx = w * 0.5;
      const cy = h * 0.5 + Math.sin(elapsed * 0.7) * (hover.current ? 2 : 5);
      const scale = Math.min(w, h) * 0.38 * (hover.current ? 1.06 : 1);
      const f = 2.55;
      const intensity = hover.current ? 1.55 : 1;

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Architectural ground — a receding ellipse, the instrument's horizon.
      ctx.save();
      ctx.translate(cx, cy + scale * 1.05);
      ctx.scale(1, 0.22);
      const ground = ctx.createRadialGradient(0, 0, 4, 0, 0, scale * 1.35);
      ground.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${light ? 0.14 : 0.18})`);
      ground.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ground;
      ctx.beginPath();
      ctx.arc(0, 0, scale * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Soft volume glow
      const glow = ctx.createRadialGradient(cx, cy, scale * 0.1, cx, cy, scale * 1.7);
      glow.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${light ? 0.12 : 0.22})`);
      glow.addColorStop(0.45, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${light ? 0.04 : 0.08})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const lattice = VERTS.map(([x, y, z]) => {
        const [rx, ry, rz] = rotate(x, y, z, rotA[0], rotA[1]);
        return project(rx, ry, rz, f, cx, cy, scale);
      });

      // Back edges
      for (const [a, b] of EDGES) {
        const A = lattice[a];
        const B = lattice[b];
        const z = (A.z + B.z) * 0.5;
        if (z >= 0) continue;
        const depth = 1 - Math.min(1, (-z) * 0.7);
        ctx.beginPath();
        ctx.moveTo(A.px, A.py);
        ctx.lineTo(B.px, B.py);
        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.08 + depth * 0.16})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // Armillae (back already handled inside drawRing)
      RING_TILTS.forEach(([rax, ray], i) => {
        drawRing(rax, ray, 1.08 + i * 0.13, rotA, RING_N, rgb, light ? 0.35 : 0.55, i === 0, f, cx, cy, scale);
      });

      // Plasma core
      if (plasma) {
        paintPlasma(plasma, elapsed, rgb, intensity);
        const coreR = scale * 0.46;
        ctx.save();
        if (!light) ctx.globalCompositeOperation = 'lighter';
        // bloom shells
        for (const [k, a] of [[1.85, 0.07], [1.35, 0.13]] as const) {
          const g = ctx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, coreR * k);
          g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * intensity})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, coreR * k, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(awaitBitmap(plasma), cx - coreR, cy - coreR, coreR * 2, coreR * 2);
        ctx.restore();
      }

      // Scan plane — a traveling parallel of the sphere
      {
        const sy = Math.sin(elapsed * (hover.current ? 1.8 : 0.85)) * 0.42;
        const sr = Math.sqrt(Math.max(0, 0.46 * 0.46 - sy * sy));
        const segs = 48;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          const [rx, ry, rz] = rotate(Math.cos(a) * sr, sy, Math.sin(a) * sr, rotA[0], rotA[1]);
          const p = project(rx, ry, rz, f, cx, cy, scale);
          if (i === 0) ctx.moveTo(p.px, p.py);
          else ctx.lineTo(p.px, p.py);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${light ? 0.35 : 0.55})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      // Front lattice
      for (const [a, b] of EDGES) {
        const A = lattice[a];
        const B = lattice[b];
        const z = (A.z + B.z) * 0.5;
        if (z < 0) continue;
        const depth = Math.min(1, 0.45 + z * 0.7);
        ctx.beginPath();
        ctx.moveTo(A.px, A.py);
        ctx.lineTo(B.px, B.py);
        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.22 + depth * 0.45})`;
        ctx.lineWidth = 0.7 + depth * 0.7;
        ctx.stroke();
      }

      // Vertices
      for (const p of lattice) {
        const front = p.z > 0;
        const r = (front ? 2.4 : 1.4) * p.s;
        const g = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, r * 3.2);
        const a = front ? (light ? 0.55 : 0.9) : 0.25;
        g.addColorStop(0, `rgba(255,255,255,${front ? 0.95 : 0.25})`);
        g.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.px, p.py, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Beads riding the outer armilla
      for (let i = 0; i < 5; i++) {
        const a = elapsed * (0.35 + i * 0.07) + i * 1.256;
        const [rax, ray] = RING_TILTS[i % 3];
        let x = Math.cos(a) * (1.08 + (i % 3) * 0.13);
        let y = 0;
        let z = Math.sin(a) * (1.08 + (i % 3) * 0.13);
        const c1 = Math.cos(rax);
        const s1 = Math.sin(rax);
        const y2 = y * c1 - z * s1;
        const z2 = y * s1 + z * c1;
        const c2 = Math.cos(ray);
        const s2 = Math.sin(ray);
        const [rx, ry, rz] = rotate(x * c2 + z2 * s2, y2, -x * s2 + z2 * c2, rotA[0], rotA[1]);
        const p = project(rx, ry, rz, f, cx, cy, scale);
        const rad = (p.z > 0 ? 2.1 : 1.1) * p.s;
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${p.z > 0 ? 0.95 : 0.3})`;
        ctx.beginPath();
        ctx.arc(p.px, p.py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // ImageData → CanvasImageSource without per-frame canvas alloc
    const plasmaScratch = document.createElement('canvas');
    const plasmaCtx = plasmaScratch.getContext('2d')!;
    const awaitBitmap = (img: ImageData) => {
      if (plasmaScratch.width !== img.width) {
        plasmaScratch.width = img.width;
        plasmaScratch.height = img.height;
      }
      plasmaCtx.putImageData(img, 0, 0);
      return plasmaScratch;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(
      ([e]) => { visible = e.isIntersecting; },
      { rootMargin: '120px' },
    );
    io.observe(wrap);
    wrap.addEventListener('pointerenter', onEnter);
    wrap.addEventListener('pointerleave', onLeave);
    wrap.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      wrap.removeEventListener('pointerenter', onEnter);
      wrap.removeEventListener('pointerleave', onLeave);
      wrap.removeEventListener('pointermove', onMove);
    };
  }, [reducedMotion, reducedData]);

  if (reducedMotion || reducedData) return null;

  return (
    <div ref={wrapRef} className="data-core" aria-hidden>
      <canvas ref={canvasRef} className="data-core__canvas" />
      <div className="data-core__caption">
        <span>ARMILLA</span>
        <span className="data-core__caption-rule" />
        <span>LATTICE 12</span>
      </div>
    </div>
  );
}
