import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptic';
import { sfx } from '@/lib/audio';

/* ═══════════════════════════════════════════════════════════════════
   THE BOLT — lock screen.

   An S drawn as a lightning strike, traced ground → sky. The mark is a
   filled, tapering polygon (the centreline offset with a mitre limit of 2),
   seated on a dark glass plate with a dotted guide down its spine and a live
   contact node at the ground terminal: what to do is drawn, not written.

   You cannot fail. The corridor is wide, progress never falls back while you
   hold, and letting go early drains the charge instead of punishing you.

   FRAME BUDGET — the rules this file is built on:
   • Nothing that changes per frame carries a CSS/SVG filter. A drop-shadow
     whose radius tracks the charge re-runs a blur over the whole mark on every
     pointermove; the glow here is stacked strokes and static gradients.
   • One DOM write pass per frame (rAF), and only to: one inherited
     stroke-dashoffset, two transforms, one opacity, one text node when the
     integer changes. No custom property on the root — that invalidates style
     for the whole subtree.
   • No layout reads on the move path. The finger is mapped through the
     stage's untransformed box, cached on press and on resize; the spark is
     interpolated from the pre-sampled spine instead of getPointAtLength.
   • The strike is transform + opacity only, so it runs on the compositor
     while React mounts the hero behind it.
   ═══════════════════════════════════════════════════════════════════ */

/** Outline: centreline [66,368]→[170,250]→[92,232]→[176,46], mitre 2. */
const BOLT_D =
  'M 68.3 370.0 L 223.9 232.7 L 130.2 213.1 L 178.7 47.2 L 173.3 44.8 L 53.8 250.9 L 116.1 267.3 L 63.7 366.0 Z';
/** The axis the charge travels, and the line the finger is measured against. */
const SPINE_D = 'M 66 368 L 170 250 L 92 232 L 176 46';
const VB_W = 240;
const VB_H = 400;
const GROUND = { x: 66, y: 368 };
const SKY = { x: 176, y: 46 };

const SAMPLE = 96;
/** Corridor half-width in viewBox units. The bolt is ~120 wide: this is wide
    on purpose — a front door is not a dexterity test. */
const RAIL = 78;
/** How far ahead of the current position the finger may jump. */
const LOOKAHEAD = 26;
/** Grab radius around the ground terminal. */
const GRAB = 96;
const COMMIT = 0.9;
/** The one detent you feel on the way up. */
const ARM = 0.5;
const TILT = 9;
/** Charge drain on release. A duration, not a rate: integrating a rate with a
    clamped dt makes the animation run slower the slower the device is. */
const DRAIN_MS = 420;
/** Spark diameter in CSS px (see .lock__spark). */
const SPARK = 56;

type Pt = { x: number; y: number };
type Box = { left: number; top: number; scale: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export default function BootScreen() {
  const { t } = useTranslation();
  const setBooted = useAppStore((s) => s.setBooted);
  const theme = useAppStore((s) => s.theme);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const skipLock =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('shot');
  const [done, setDone] = useState(skipLock);
  const [unlocked, setUnlocked] = useState(skipLock);

  const rootRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spineRef = useRef<SVGPathElement>(null);
  const dashRef = useRef<SVGGElement>(null);
  const sparkRef = useRef<HTMLSpanElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  const p = useRef(0);
  const shown = useRef(-1);
  const cursor = useRef(0);
  const holding = useRef(false);
  const armed = useRef(false);
  const tick = useRef(-1);
  const opening = useRef(false);
  const template = useRef<Pt[]>([]);
  const spineLen = useRef(0);
  const box = useRef<Box | null>(null);
  const raf = useRef(0);
  const frameRaf = useRef(0);
  const pendingV = useRef<number | null>(null);
  const pendingTilt = useRef<Pt | null>(null);

  /* ── Paint: the one write pass ───────────────────────────────── */
  const paintNow = useCallback((v: number) => {
    p.current = v;
    const total = spineLen.current;
    // Inherited by every stroke in the group: one write lights them all.
    if (dashRef.current && total > 0) {
      dashRef.current.style.strokeDashoffset = String(total * (1 - v));
    }

    const tpl = template.current;
    const spark = sparkRef.current;
    const b = box.current;
    if (spark && tpl.length > 1 && b) {
      const f = v * (tpl.length - 1);
      const i = Math.min(tpl.length - 2, Math.floor(f));
      const k = f - i;
      const x = (tpl[i].x + (tpl[i + 1].x - tpl[i].x) * k) * b.scale - SPARK / 2;
      const y = (tpl[i].y + (tpl[i + 1].y - tpl[i].y) * k) * b.scale - SPARK / 2;
      spark.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${0.55 + v * 0.7})`;
      spark.style.opacity = v > 0 ? '1' : '0';
    }

    if (auraRef.current) auraRef.current.style.opacity = String(0.35 + v * 0.65);
    if (barRef.current) barRef.current.style.transform = `scaleX(${v})`;
    const n = Math.round(v * 100);
    if (n !== shown.current && pctRef.current) {
      shown.current = n;
      pctRef.current.textContent = String(n).padStart(3, '0');
    }
  }, []);

  const flush = useCallback(() => {
    frameRaf.current = 0;
    if (pendingV.current !== null) {
      paintNow(pendingV.current);
      pendingV.current = null;
    }
    const tl = pendingTilt.current;
    if (tl && plateRef.current) {
      plateRef.current.style.transform = `rotateX(${-tl.y * TILT}deg) rotateY(${tl.x * TILT}deg)`;
      pendingTilt.current = null;
    }
  }, [paintNow]);

  const schedule = useCallback(() => {
    if (!frameRaf.current) frameRaf.current = requestAnimationFrame(flush);
  }, [flush]);

  const paint = useCallback(
    (v: number) => {
      p.current = v;
      pendingV.current = v;
      schedule();
    },
    [schedule],
  );

  /* ── Geometry: cached, never read on the move path ───────────── */
  /** The stage's layout box (transforms excluded — the tilt is a visual
      flourish of a few degrees and the corridor is wide). */
  const measure = useCallback((): Box | null => {
    const root = rootRef.current;
    const plate = plateRef.current;
    if (!root || !plate) return null;
    const r = root.getBoundingClientRect();
    const scale = plate.offsetWidth / VB_W;
    box.current = { left: r.left + plate.offsetLeft, top: r.top + plate.offsetTop, scale };
    return box.current;
  }, []);

  const toSvg = useCallback(
    (clientX: number, clientY: number): Pt | null => {
      const b = box.current ?? measure();
      if (!b || b.scale <= 0) return null;
      return { x: (clientX - b.left) / b.scale, y: (clientY - b.top) / b.scale };
    },
    [measure],
  );

  /** Monotonic. Outside the corridor the charge HOLDS — it never falls back
      under the finger, which is what made the old screen feel like a test. */
  const advance = useCallback((at: Pt): number => {
    const tpl = template.current;
    if (tpl.length < 2) return 0;
    let best = RAIL + 1;
    let bestI = cursor.current;
    for (let k = 0; k <= LOOKAHEAD; k++) {
      const j = cursor.current + k;
      if (j >= tpl.length) break;
      const d = dist(at, tpl[j]);
      if (d < best) {
        best = d;
        bestI = j;
      }
    }
    if (best > RAIL) return cursor.current / (tpl.length - 1);
    cursor.current = Math.max(cursor.current, bestI);
    return cursor.current / (tpl.length - 1);
  }, []);

  /* ── Opening ─────────────────────────────────────────────────── */
  const open = useCallback(() => {
    if (opening.current) return;
    opening.current = true;
    holding.current = false;
    cancelAnimationFrame(raf.current);
    cursor.current = Math.max(0, template.current.length - 1);
    paintNow(1);
    setUnlocked(true);
    haptic('success');
    sfx.confirm();
    sfx.open();
    window.setTimeout(() => setBooted(true), 90);
    window.setTimeout(() => setDone(true), reducedMotion ? 340 : 960);
  }, [paintNow, reducedMotion, setBooted]);

  /* ── Release: the charge drains. This is the whole failure story. ── */
  const drain = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const from = p.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DRAIN_MS);
      // easeOutCubic — leaves quickly, settles softly, never slams shut.
      const next = from * Math.pow(1 - k, 3);
      if (k >= 1) {
        cursor.current = 0;
        armed.current = false;
        tick.current = -1;
        plateRef.current?.removeAttribute('data-armed');
        paintNow(0);
        return;
      }
      cursor.current = Math.round(next * (template.current.length - 1));
      paintNow(next);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [paintNow]);

  /* ── Tilt ────────────────────────────────────────────────────── */
  const aimTilt = useCallback(
    (clientX: number, clientY: number) => {
      if (reducedMotion) return;
      pendingTilt.current = {
        x: (clientX / window.innerWidth - 0.5) * 2,
        y: (clientY / window.innerHeight - 0.5) * 2,
      };
      schedule();
    },
    [reducedMotion, schedule],
  );

  /* ── Pointer ─────────────────────────────────────────────────── */
  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (opening.current) return;
      if (reducedMotion) {
        open();
        return;
      }
      measure();
      aimTilt(e.clientX, e.clientY);
      const at = toSvg(e.clientX, e.clientY);
      if (!at || template.current.length === 0) return;
      if (dist(at, template.current[0]) > GRAB) {
        // Away from the striking point: the mark and its contact node answer
        // instead of a message telling you where to start.
        const plate = plateRef.current;
        plate?.setAttribute('data-hint', '');
        window.setTimeout(() => plate?.removeAttribute('data-hint'), 700);
        haptic('light');
        return;
      }
      cancelAnimationFrame(raf.current);
      holding.current = true;
      armed.current = false;
      cursor.current = 0;
      tick.current = -1;
      plateRef.current?.setAttribute('data-holding', '');
      plateRef.current?.removeAttribute('data-armed');
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      paint(0);
      haptic('light');
      sfx.hover();
    },
    [aimTilt, measure, open, paint, reducedMotion, toSvg],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (opening.current) return;
      if (e.pointerType === 'mouse' || holding.current) aimTilt(e.clientX, e.clientY);
      if (!holding.current) return;
      const at = toSvg(e.clientX, e.clientY);
      if (!at) return;
      const v = advance(at);
      if (v === p.current) return;
      paint(v);
      // Rising ladder of ticks: audio only. Haptics stay at three, sound is
      // free to give the climb texture.
      const step = Math.floor(v * 7);
      if (step > tick.current) {
        tick.current = step;
        sfx.hover();
      }
      if (!armed.current && v >= ARM) {
        armed.current = true;
        haptic('light');
        plateRef.current?.setAttribute('data-armed', '');
      }
      if (v >= COMMIT) open();
    },
    [advance, aimTilt, open, paint, toSvg],
  );

  const onUp = useCallback(() => {
    if (!holding.current || opening.current) return;
    holding.current = false;
    plateRef.current?.removeAttribute('data-holding');
    if (p.current >= COMMIT) open();
    else drain();
  }, [drain, open]);

  const onLeave = useCallback(() => {
    if (reducedMotion || holding.current) return;
    pendingTilt.current = { x: 0, y: 0 };
    schedule();
  }, [reducedMotion, schedule]);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (opening.current) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    [open],
  );

  /* ── Lifecycle ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!skipLock) return;
    localStorage.setItem('hkmodd-theme', 'default');
    document.documentElement.removeAttribute('data-theme');
    document.querySelector('.app-root')?.removeAttribute('data-theme');
    useAppStore.setState({ theme: 'default', booted: true });
  }, [skipLock]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (done) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      html.style.overflow = '';
      body.style.overflow = '';
      html.style.height = '';
      body.style.height = '';
      return;
    }
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';
  }, [done]);

  useEffect(() => {
    if (done) return;
    const spine = spineRef.current;
    if (spine) {
      const total = spine.getTotalLength();
      spineLen.current = total;
      const out: Pt[] = [];
      for (let i = 0; i <= SAMPLE; i++) {
        const q = spine.getPointAtLength((total * i) / SAMPLE);
        out.push({ x: q.x, y: q.y });
      }
      template.current = out;
      if (dashRef.current) dashRef.current.style.strokeDasharray = String(total);
    }
    measure();
    paintNow(0);
    const invalidate = () => {
      box.current = null;
      // The spark is placed in stage px; re-place it at the new scale.
      requestAnimationFrame(() => {
        measure();
        paintNow(p.current);
      });
    };
    window.addEventListener('resize', invalidate, { passive: true });
    return () => {
      window.removeEventListener('resize', invalidate);
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(frameRaf.current);
    };
  }, [done, measure, paintNow]);

  if (done) return null;

  const hint = reducedMotion ? t.boot.hintTap : t.boot.hint;
  const node = (at: Pt) => ({ left: pct(at.x, VB_W), top: pct(at.y, VB_H) }) as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`lock${unlocked ? ' is-unlocking' : ''}`}
      data-theme={theme !== 'default' ? theme : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onLeave}
    >
      <div className="lock__field" aria-hidden />
      <div ref={auraRef} className="lock__aura" aria-hidden />
      <div className="lock__flash" aria-hidden />
      <div className="lock__wave" aria-hidden />

      <div className="lock__chrome" aria-hidden>
        <i className="lock__corner lock__corner--tl" />
        <i className="lock__corner lock__corner--tr" />
        <i className="lock__corner lock__corner--bl" />
        <i className="lock__corner lock__corner--br" />
        <span className="lock__mark lock__mark--l">{t.hero.name}</span>
        <span className="lock__mark lock__mark--r">
          {t.boot.site} <span className="lock__mark-rule" /> {new Date().getFullYear()}
        </span>
      </div>

      <div ref={plateRef} className="lock__plate">
        <div
          ref={stageRef}
          className="lock__stage"
          role="button"
          tabIndex={0}
          aria-label={`${hint} — ${t.boot.key}`}
          onKeyDown={onKey}
        >
          {/* Contact shadow on the floor the mark stands over. */}
          <div className="lock__floor" aria-hidden />

          {/* Back plate — the side of the solid, parallaxed under tilt. */}
          <div className="lock__layer lock__depth" aria-hidden>
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`}><path d={BOLT_D} /></svg>
          </div>

          <div className="lock__body">
            {/* Cold glass: face, rim, and the dotted route to trace. */}
            <div className="lock__layer lock__face" aria-hidden>
              <svg viewBox={`0 0 ${VB_W} ${VB_H}`}>
                <defs>
                  <linearGradient id="boltGlass" gradientUnits="userSpaceOnUse" x1="54" y1="370" x2="224" y2="45">
                    <stop className="lock__glass-a" offset="0%" />
                    <stop className="lock__glass-b" offset="100%" />
                  </linearGradient>
                </defs>
                <path className="lock__bolt-cold" d={BOLT_D} />
                <path className="lock__guide" d={SPINE_D} />
                <path ref={spineRef} data-spine d={SPINE_D} fill="none" stroke="none" />
              </svg>
            </div>

            {/* The charge. Its own layer: only this one repaints per frame. */}
            <div className="lock__layer lock__hot" aria-hidden>
              <svg viewBox={`0 0 ${VB_W} ${VB_H}`}>
                <defs>
                  {/* userSpaceOnUse: the ramp is anchored to the mark. */}
                  <linearGradient id="boltHot" gradientUnits="userSpaceOnUse" x1="54" y1="370" x2="224" y2="45">
                    <stop className="lock__hot-a" offset="0%" />
                    <stop className="lock__hot-b" offset="60%" />
                    <stop className="lock__hot-c" offset="100%" />
                  </linearGradient>
                  {/* A clip, not a mask: static geometry, nothing to
                      recompute when the plate's 3D transform changes. */}
                  <clipPath id="boltClip">
                    <path d={BOLT_D} />
                  </clipPath>
                </defs>
                {/* dasharray/offset are inherited: set once on the group. */}
                <g ref={dashRef} className="lock__charge" strokeDasharray="10000" strokeDashoffset="10000">
                  <g clipPath="url(#boltClip)">
                    {/* The outline sits at most 58 units off the spine: 150
                        covers it; wider floods past the spark at the kinks. */}
                    <path className="lock__fill" d={SPINE_D} />
                  </g>
                  <path className="lock__glow lock__glow--wide" d={SPINE_D} />
                  <path className="lock__glow lock__glow--mid" d={SPINE_D} />
                  <path className="lock__filament" d={SPINE_D} />
                </g>
              </svg>
            </div>

            {/* White-hot on contact — faded in by opacity, never by a
                stroke-colour keyframe (that one runs on the main thread). */}
            <div className="lock__layer lock__white" aria-hidden>
              <svg viewBox={`0 0 ${VB_W} ${VB_H}`}><path d={BOLT_D} /></svg>
            </div>

            <span className="lock__node lock__node--sky" style={node(SKY)} aria-hidden />
            <span className="lock__node lock__node--ground" style={node(GROUND)} aria-hidden>
              <i />
            </span>
            <span ref={sparkRef} className="lock__spark" aria-hidden />
          </div>
        </div>
      </div>

      <div className="lock__hud">
        <p className="lock__hint">{hint}</p>
        <p className="lock__sub">
          {!reducedMotion && <span>{t.boot.from}</span>}
          {/* Keyboard path: only where there is a keyboard to speak of. */}
          <span className="lock__key">{reducedMotion ? '' : ' · '}{t.boot.key}</span>
        </p>
        <div className="lock__meter" aria-hidden>
          <span className="lock__bar"><i ref={barRef} /></span>
          <span ref={pctRef} className="lock__pct">000</span>
        </div>
      </div>
    </div>
  );
}
