import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptic';
import { sfx } from '@/lib/audio';

/* ═══════════════════════════════════════════════════════════════════
   THRESHOLD — the lock screen.

   One object, one axis, direct manipulation. There is no shape to trace
   and no way to fail: releasing early is not an error, it is a spring
   returning the lens to rest. The only instruction is the sheen crossing
   the label, which states the direction without saying a word.

   Depth is real. The plate carries `perspective`, and the lens sits at a
   higher translateZ than its own shadow, so tilting parallaxes one against
   the other instead of faking it with a blur.
   ═══════════════════════════════════════════════════════════════════ */

/** Travel required to open. Near the end, like a well-made physical latch. */
const COMMIT = 0.94;
/** Point of no return — the one detent you feel on the way across. */
const ARM = 0.55;
/** Max plate tilt in degrees. 5.5 measured as two pixels of foreshortening —
    technically 3D, perceptually flat. This plus the tighter perspective is
    what makes the object read as an object. */
const TILT = 11;
/** Under-damped on purpose: one small overshoot as it seats. */
const SPRING_K = 210;
const SPRING_C = 21;
/** Grab radius around the lens, in px. Generous — this is a door, not a target. */
const GRAB = 46;
/** How far the lens hops when you press somewhere else. ~26px of 352. */
const NUDGE = 0.075;

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
  const trackRef = useRef<HTMLDivElement>(null);

  /* Progress lives in a ref and reaches the DOM as one custom property.
     Dragging must not re-render React — the neural mesh is already running
     behind this screen. */
  const p = useRef(0);
  const vel = useRef(0);
  const travel = useRef(1);
  const dragging = useRef(false);
  const grabDx = useRef(0);
  const armed = useRef(false);
  const opening = useRef(false);
  const raf = useRef(0);
  const tiltRaf = useRef(0);
  const pendingTilt = useRef<{ x: number; y: number } | null>(null);

  const writeP = useCallback((v: number) => {
    p.current = v;
    plateRef.current?.style.setProperty('--p', String(v));
    rootRef.current?.style.setProperty('--p', String(v));
  }, []);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const lens = track.querySelector<HTMLElement>('.lock__lens');
    const w = track.clientWidth;
    const lensW = lens?.offsetWidth ?? 62;
    // 7px inset either side, matching the CSS.
    travel.current = Math.max(1, w - lensW - 14);
    track.style.setProperty('--travel', `${travel.current}px`);
  }, []);

  /* ── Opening ─────────────────────────────────────────────────── */
  const open = useCallback(() => {
    if (opening.current) return;
    opening.current = true;
    dragging.current = false;
    cancelAnimationFrame(raf.current);
    writeP(1);
    setUnlocked(true);
    haptic('success');
    sfx.confirm();
    sfx.open();
    window.setTimeout(() => setBooted(true), 90);
    // Reduced motion gets the 320ms dissolve, so it must also get out in
    // 320ms. Holding the teardown at the full camera-move duration left the
    // viewer looking at an already-faded plate for two thirds of a second.
    window.setTimeout(() => setDone(true), reducedMotion ? 340 : 1000);
  }, [reducedMotion, setBooted, writeP]);

  /* ── Spring: the lens has mass and finds its way home ─────────── */
  const settle = useCallback(() => {
    cancelAnimationFrame(raf.current);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const a = -SPRING_K * p.current - SPRING_C * vel.current;
      vel.current += a * dt;
      const next = p.current + vel.current * dt;
      writeP(Math.max(0, Math.min(1, next)));

      if (Math.abs(p.current) < 0.0015 && Math.abs(vel.current) < 0.02) {
        const travelled = armed.current;
        // Exactly zero, not "close enough": a lens resting a pixel off its
        // seat is the kind of thing you feel before you can name it.
        writeP(0);
        vel.current = 0;
        armed.current = false;
        // A real knob clicks when it seats. Only after a real trip, and
        // never as a punishment — there is no failure here to report.
        if (travelled) haptic('light');
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [writeP]);

  /* ── Tilt: coalesced, one write per frame ────────────────────── */
  const flushTilt = useCallback(() => {
    tiltRaf.current = 0;
    const v = pendingTilt.current;
    const plate = plateRef.current;
    if (!v || !plate) return;
    plate.style.setProperty('--ty', `${v.x * TILT}deg`);
    plate.style.setProperty('--tx', `${-v.y * TILT}deg`);
  }, []);

  const aimTilt = useCallback(
    (clientX: number, clientY: number) => {
      if (reducedMotion) return;
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      // Normalised to -1..1 so TILT reads as the real maximum in degrees.
      pendingTilt.current = {
        x: ((clientX - r.left) / r.width - 0.5) * 2,
        y: ((clientY - r.top) / r.height - 0.5) * 2,
      };
      if (!tiltRaf.current) tiltRaf.current = requestAnimationFrame(flushTilt);
    },
    [flushTilt, reducedMotion],
  );

  /* ── Pointer ─────────────────────────────────────────────────── */
  const localX = useCallback((clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return clientX - r.left - 7; // 7px inset
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (opening.current) return;
      if (reducedMotion) {
        open();
        return;
      }
      measure();
      aimTilt(e.clientX, e.clientY);

      const x = localX(e.clientX);
      const lensX = p.current * travel.current;
      const lensCentre = lensX + 31;

      if (Math.abs(x - lensCentre) > GRAB) {
        // Pressed away from the lens. Don't teleport it — hop it forward and
        // let the spring bring it back. The object shows you where it is
        // instead of a message telling you.
        //
        // This is a displacement, not a velocity impulse: at this damping an
        // impulse is eaten inside two frames and the hop never becomes
        // visible (measured peak 0.001 — under half a pixel of travel).
        cancelAnimationFrame(raf.current);
        vel.current = 0;
        armed.current = false;
        writeP(NUDGE);
        settle();
        haptic('light');
        return;
      }

      cancelAnimationFrame(raf.current);
      dragging.current = true;
      armed.current = false;
      vel.current = 0;
      grabDx.current = x - lensX;
      plateRef.current?.setAttribute('data-dragging', '');
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      haptic('light');
      sfx.hover();
    },
    [aimTilt, localX, measure, open, reducedMotion, settle, writeP],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (opening.current) return;
      aimTilt(e.clientX, e.clientY);
      if (!dragging.current) return;

      const next = Math.max(0, Math.min(1, (localX(e.clientX) - grabDx.current) / travel.current));
      vel.current = (next - p.current) * 24; // carry momentum into the spring
      writeP(next);

      if (!armed.current && next >= ARM) {
        armed.current = true;
        haptic('light');
        sfx.hover();
      }
      if (next >= COMMIT) open();
    },
    [aimTilt, localX, open, writeP],
  );

  const onUp = useCallback(() => {
    if (!dragging.current || opening.current) return;
    dragging.current = false;
    plateRef.current?.removeAttribute('data-dragging');
    if (p.current >= COMMIT) open();
    else settle();
  }, [open, settle]);

  const onLeave = useCallback(() => {
    if (reducedMotion) return;
    pendingTilt.current = { x: 0, y: 0 };
    if (!tiltRaf.current) tiltRaf.current = requestAnimationFrame(flushTilt);
  }, [flushTilt, reducedMotion]);

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
    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(tiltRaf.current);
    };
  }, [done, measure]);

  const hint = reducedMotion ? t.boot.hintTap : t.boot.hint;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          ref={rootRef}
          className={`lock${unlocked ? ' is-unlocking' : ''}`}
          data-theme={theme !== 'default' ? theme : undefined}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onLeave}
        >
          <div className="lock__field" aria-hidden />
          <div className="lock__grain" aria-hidden />
          <div className="lock__horizon" aria-hidden />

          <div ref={plateRef} className="lock__plate">
            <div
              ref={trackRef}
              className="lock__track"
              role="button"
              tabIndex={0}
              aria-label={hint}
              onKeyDown={onKey}
            >
              <div className="lock__well" aria-hidden>
                <div className="lock__fill" />
                <p className="lock__label">{hint}</p>
              </div>
              <span className="lock__latch" aria-hidden />
              <span className="lock__shadow" aria-hidden />
              <span className="lock__lens" aria-hidden>
                <span className="lock__lens-ring" />
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
