import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { neuralStats } from '@/lib/neuralStats';

/* ═══════════════════════════════════════════════════════════════════
   TELEMETRY HUD — Quake-console-style diagnostics overlay.

   Toggled with ` (Backquote) or the `hud` terminal command. Shows the
   live engine backend, real frame timing, render resolution and buffer
   stats. FPS is measured here with its own rAF loop (an exponential
   moving average over real frame deltas), so it reflects what the page
   actually achieves — not what the engine claims.
   ═══════════════════════════════════════════════════════════════════ */

interface BuildInfo {
  version: string;
  buildTime: string;
}

let _buildInfo: BuildInfo | null | undefined; // undefined = not fetched yet

function useHudSample(open: boolean) {
  const [, force] = useState(0);
  const fpsRef = useRef({ ema: 0, last: 0 });

  useEffect(() => {
    if (!open) return;

    let raf = 0;
    const meter = (t: number) => {
      const s = fpsRef.current;
      if (s.last > 0) {
        const dt = t - s.last;
        // EMA over frame deltas — stable to read, honest to spikes.
        s.ema = s.ema === 0 ? dt : s.ema * 0.95 + dt * 0.05;
      }
      s.last = t;
      raf = requestAnimationFrame(meter);
    };
    raf = requestAnimationFrame(meter);

    const tick = setInterval(() => force((n) => n + 1), 250);

    if (_buildInfo === undefined) {
      _buildInfo = null;
      fetch('/version.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => { _buildInfo = v; })
        .catch(() => { _buildInfo = null; });
    }

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(tick);
      fpsRef.current = { ema: 0, last: 0 };
    };
  }, [open]);

  return fpsRef.current.ema;
}

export default function TelemetryHUD() {
  const hudOpen = useAppStore((s) => s.hudOpen);
  const toggleHud = useAppStore((s) => s.toggleHud);
  const frameMs = useHudSample(hudOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      toggleHud();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleHud]);

  if (!hudOpen) return null;

  const s = neuralStats;
  const fps = frameMs > 0 ? 1000 / frameMs : 0;
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

  const rows: Array<[string, string]> = [
    ['ENGINE', s.backend],
    ['FRAME', frameMs > 0 ? `${fps.toFixed(1)} fps · ${frameMs.toFixed(2)} ms` : '—'],
    ['RES', s.resW > 0 ? `${s.resW}×${s.resH} @${s.dpr.toFixed(2)}x` : '—'],
    ['NODES', String(s.nodes || '—')],
    ['LINKS', s.connections < 0 ? 'gpu-resident · cap 2700' : String(s.connections)],
    ['PULSES', String(s.pulses || '—')],
  ];
  if (heap) rows.push(['HEAP', `${(heap.usedJSHeapSize / 1048576).toFixed(1)} MB`]);
  if (_buildInfo) rows.push(['BUILD', `${_buildInfo.version.slice(0, 8)} · ${_buildInfo.buildTime.slice(0, 10)}`]);

  return (
    <div
      className="fixed top-16 left-4 z-[10000] pointer-events-none select-none"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        lineHeight: '1.7',
        letterSpacing: '0.08em',
        color: 'var(--color-text)',
        background: 'rgba(5, 5, 8, 0.82)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
        borderRadius: '6px',
        padding: '10px 14px',
        backdropFilter: 'blur(8px)',
        minWidth: '240px',
      }}
    >
      <div style={{ color: 'var(--color-accent)', marginBottom: 6, fontWeight: 600 }}>
        {'// TELEMETRY'}
        <span style={{ float: 'right', opacity: 0.5 }}>` to close</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 12 }}>
          <span style={{ color: 'var(--color-text-muted)', width: 58, flexShrink: 0 }}>{k}</span>
          <span style={{ color: 'var(--color-accent)' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
