import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptic';
import { sfx } from '@/lib/audio';

/**
 * Three-stroke S. Ground → sky.
 * 1. diagonal up-right  2. waist left  3. diagonal up-right.
 * Tips are pointed markers, not round caps.
 */
const S_D = 'M 54 358 L 186 232 L 54 232 L 186 52';

const SAMPLE = 64;
const GRAB_R = 74;
const RAIL_R = 62;
const UNLOCK_AT = 0.8;
const BANDS = [0.18, 0.4, 0.66, 0.8];

type Pt = { x: number; y: number };

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function samplePath(path: SVGPathElement): Pt[] {
  const len = path.getTotalLength();
  const out: Pt[] = [];
  for (let i = 0; i <= SAMPLE; i++) {
    const p = path.getPointAtLength((len * i) / SAMPLE);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

export default function BootScreen() {
  const { t } = useTranslation();
  const setBooted = useAppStore((s) => s.setBooted);
  const theme = useAppStore((s) => s.theme);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const skipLock =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('shot');
  const [done, setDone] = useState(skipLock);
  const [unlocked, setUnlocked] = useState(skipLock);

  const svgRef = useRef<SVGSVGElement>(null);
  const guideRef = useRef<SVGPathElement>(null);
  const inkRef = useRef<SVGPathElement>(null);
  const coreRef = useRef<SVGPathElement>(null);
  const beadRef = useRef<SVGCircleElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const holding = useRef(false);
  const cursor = useRef(0);
  const lastBand = useRef(-1);
  const template = useRef<Pt[]>([]);
  const unlocking = useRef(false);

  const toSvg = useCallback((clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const placeBead = useCallback((i: number) => {
    const p = template.current[i];
    const bead = beadRef.current;
    if (!p || !bead) return;
    bead.setAttribute('cx', String(p.x));
    bead.setAttribute('cy', String(p.y));
  }, []);

  const paint = useCallback((progress: number) => {
    const off = String(1 - progress);
    if (inkRef.current) inkRef.current.style.strokeDashoffset = off;
    if (coreRef.current) coreRef.current.style.strokeDashoffset = off;
    placeBead(cursor.current);
    stageRef.current?.style.setProperty('--lock-p', String(progress));
  }, [placeBead]);

  const resetStroke = useCallback(() => {
    holding.current = false;
    cursor.current = 0;
    lastBand.current = -1;
    if (inkRef.current) inkRef.current.style.strokeDashoffset = '1';
    if (coreRef.current) coreRef.current.style.strokeDashoffset = '1';
    placeBead(0);
    stageRef.current?.style.setProperty('--lock-p', '0');
  }, [placeBead]);

  const unlock = useCallback(() => {
    if (unlocking.current) return;
    unlocking.current = true;
    cursor.current = Math.max(0, template.current.length - 1);
    paint(1);
    setUnlocked(true);
    haptic('success');
    sfx.confirm();
    sfx.open();
    window.setTimeout(() => setBooted(true), 90);
    window.setTimeout(() => setDone(true), 1100);
  }, [paint, setBooted]);

  const advance = useCallback((p: Pt) => {
    const tpl = template.current;
    if (tpl.length < 2) return 0;
    let best = RAIL_R + 1;
    let bestI = cursor.current;
    for (let k = 0; k <= 16; k++) {
      const j = cursor.current + k;
      if (j >= tpl.length) break;
      const d = dist(p, tpl[j]);
      if (d < best) {
        best = d;
        bestI = j;
      }
    }
    if (best > RAIL_R) return cursor.current / (tpl.length - 1);
    cursor.current = bestI;
    const progress = cursor.current / (tpl.length - 1);
    const band = BANDS.findIndex((b) => progress >= b);
    if (band > lastBand.current) {
      lastBand.current = band;
      haptic(band >= 3 ? 'medium' : 'light');
      sfx.hover();
    }
    return progress;
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (unlocking.current) return;
      if (reducedMotion) {
        unlock();
        return;
      }
      const p = toSvg(e.clientX, e.clientY);
      if (!p || template.current.length === 0) return;
      if (dist(p, template.current[0]) > GRAB_R) return;
      cursor.current = 0;
      holding.current = true;
      lastBand.current = -1;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      paint(0);
      haptic('light');
    },
    [paint, reducedMotion, toSvg, unlock],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!holding.current || unlocking.current) return;
      const p = toSvg(e.clientX, e.clientY);
      if (!p) return;
      const progress = advance(p);
      paint(progress);
      if (progress >= UNLOCK_AT) {
        holding.current = false;
        unlock();
      }
    },
    [advance, paint, toSvg, unlock],
  );

  const onUp = useCallback(() => {
    if (!holding.current || unlocking.current) return;
    const progress = cursor.current / Math.max(1, template.current.length - 1);
    if (progress >= UNLOCK_AT) unlock();
    else {
      haptic('error');
      resetStroke();
    }
  }, [resetStroke, unlock]);

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
    const path = guideRef.current;
    if (!path) return;
    template.current = samplePath(path);
    for (const el of [inkRef.current, coreRef.current]) {
      if (!el) continue;
      el.style.strokeDasharray = '1';
      el.style.strokeDashoffset = '1';
    }
    placeBead(0);
  }, [placeBead]);

  const hint = reducedMotion ? t.boot.hintTap : t.boot.hint;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className={`lock${unlocked ? ' is-unlocking' : ''}`}
          data-theme={theme !== 'default' ? theme : undefined}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="lock__sky" aria-hidden />
          <div className="lock__ground" aria-hidden />

          <div ref={stageRef} className={`lock__stage${unlocked ? ' is-open' : ''}`}>
            <svg
              ref={svgRef}
              className="lock__svg"
              viewBox="0 0 240 400"
              preserveAspectRatio="xMidYMax meet"
              aria-label={hint}
            >
              <defs>
                <linearGradient id="boltInk" x1="0.15" y1="1" x2="0.85" y2="0">
                  <stop offset="0%" stopColor="#00e5ff" />
                  <stop offset="50%" stopColor="#f4fbff" />
                  <stop offset="100%" stopColor="#ff2a6d" />
                </linearGradient>
                <filter id="boltBloom" x="-30%" y="-12%" width="160%" height="124%">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <marker id="sTipEnd" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="3.2" markerHeight="3.2" orient="auto">
                  <path d="M 0 0 L 12 6 L 0 12 Z" fill="#f4fbff" />
                </marker>
                <marker id="sTipStart" viewBox="0 0 12 12" refX="1" refY="6" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
                  <path d="M 0 0 L 12 6 L 0 12 Z" fill="#00e5ff" />
                </marker>
              </defs>

              <path className="lock__bloom" d={S_D} fill="none" />
              <path
                ref={guideRef}
                className="lock__guide"
                d={S_D}
                fill="none"
                pathLength={1}
                markerStart="url(#sTipStart)"
                markerEnd="url(#sTipEnd)"
              />
              <path className="lock__shimmer" d={S_D} fill="none" pathLength={1} />
              <path
                ref={inkRef}
                className="lock__ink"
                d={S_D}
                fill="none"
                pathLength={1}
                filter="url(#boltBloom)"
                markerStart="url(#sTipStart)"
                markerEnd="url(#sTipEnd)"
              />
              <path ref={coreRef} className="lock__core" d={S_D} fill="none" pathLength={1} />
              <circle ref={beadRef} className="lock__bead" cx="54" cy="358" r="9" />
            </svg>
          </div>

          <p className="lock__hint">{unlocked ? '' : hint}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
