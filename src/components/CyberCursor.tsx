import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';


/* ═══════════════════════════════════════════════════════════════════
   CYBER CURSOR - ultra-sharp animated arrow cursor (desktop only)
   Replaces the native cursor with a razor-sharp SVG chevron/arrow
   that LERPs smoothly, glows with theme accent, and morphs on hover.
   ═══════════════════════════════════════════════════════════════════ */

// Don't render on touch devices
const isTouchDevice =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export default function CyberCursor() {
  const theme = useAppStore((s) => s.theme);
  const cursorRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -100, y: -100 }); // current lerped position
  const trailPosRef = useRef({ x: -100, y: -100 }); // current lerped trail position
  const targetRef = useRef({ x: -100, y: -100 }); // raw mouse position
  const hoveringRef = useRef(false);
  const clickingRef = useRef(false);
  const lastHoverRef = useRef(false); // last-applied hover state
  const lastClickRef = useRef(false); // last-applied click state
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false); // is the rAF loop currently armed?

  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const accentDim = theme === 'redteam' ? 'rgba(255,0,51,0.3)' : theme === 'light' ? 'rgba(0,102,204,0.3)' : 'rgba(0,212,255,0.3)';

  // ── Animation loop - smooth LERP following ──
  // Self-arresting: once cursor + trail have caught up to the target AND no
  // hover/click state is pending, the loop CANCELS itself and sleeps until the
  // next pointer event re-arms it. A still mouse → zero scheduled frames
  // (previously: a wake-up every single refresh, forever, doing nothing).
  const animate = useCallback(() => {
    const cursor = cursorRef.current;
    const trail = trailRef.current;
    if (!cursor || !trail) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    // LERP with different speeds for cursor vs trail
    const lerpCursor = 0.18;
    const lerpTrail = 0.08;

    const tx = targetRef.current.x;
    const ty = targetRef.current.y;
    const pos = posRef.current;
    const tp = trailPosRef.current;

    pos.x += (tx - pos.x) * lerpCursor;
    pos.y += (ty - pos.y) * lerpCursor;
    tp.x += (tx - tp.x) * lerpTrail;
    tp.y += (ty - tp.y) * lerpTrail;

    // Both followers within sub-pixel of the target → nothing visibly moving.
    const settled =
      Math.abs(tx - pos.x) < 0.15 && Math.abs(ty - pos.y) < 0.15 &&
      Math.abs(tx - tp.x) < 0.15 && Math.abs(ty - tp.y) < 0.15;

    const stateChanged =
      hoveringRef.current !== lastHoverRef.current ||
      clickingRef.current !== lastClickRef.current;

    // Skip the two style writes while idle and no hover/click change — avoids
    // forcing a style recalc + composite every frame when the mouse is still.
    if (!settled || stateChanged) {
      cursor.style.transform = `translate(${pos.x}px, ${pos.y}px) ${
        clickingRef.current ? 'scale(0.8)' : hoveringRef.current ? 'scale(1.3)' : 'scale(1)'
      }`;
      trail.style.transform = `translate(${tp.x}px, ${tp.y}px) ${
        hoveringRef.current ? 'scale(1.8)' : 'scale(1)'
      }`;
      lastHoverRef.current = hoveringRef.current;
      lastClickRef.current = clickingRef.current;
    }

    // Caught up and no pending state change → sleep. Re-armed by pointer events.
    if (settled && !stateChanged) {
      runningRef.current = false;
      return;
    }
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  // (Re)arm the loop. Idempotent — cheap to call from every pointer event.
  const startLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(animate);
  }, [animate]);

  useEffect(() => {
    if (isTouchDevice) return;

    // Hide native cursor
    document.documentElement.classList.add('cyber-cursor-active');

    const onMouseMove = (e: MouseEvent) => {
      targetRef.current.x = e.clientX;
      targetRef.current.y = e.clientY;
      startLoop();
    };

    const onMouseDown = () => { clickingRef.current = true; startLoop(); };
    const onMouseUp = () => { clickingRef.current = false; startLoop(); };

    const interactive = (el: EventTarget | null) => {
      if (!(el instanceof Element)) return false;
      return !!el.closest(
        'a, button, [role="button"], [data-sfx], .holo-card, .dossier-card, .arsenal-card, .btn-cyber, .mag-btn, .cert-tile',
      );
    };

    const onMouseOver = (e: MouseEvent) => {
      hoveringRef.current = interactive(e.target);
      startLoop();
    };

    const onMouseOut = (e: MouseEvent) => {
      if (!interactive(e.relatedTarget)) hoveringRef.current = false;
      startLoop();
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    document.addEventListener('mouseout', onMouseOut, { passive: true });

    startLoop();

    return () => {
      document.documentElement.classList.remove('cyber-cursor-active');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      cancelAnimationFrame(rafRef.current);
    };
  }, [startLoop]);

  // Don't render on mobile / touch
  if (isTouchDevice) return null;

  return (
    <>
      {/* Trail - soft glow circle that follows slowly */}
      <div
        ref={trailRef}
        className="cyber-cursor-trail"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 32,
          height: 32,
          marginLeft: -16,
          marginTop: -16,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentDim} 0%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: 99998,
          willChange: 'transform',
          transition: 'width 0.2s, height 0.2s, background 0.3s',
          mixBlendMode: theme === 'light' ? 'multiply' : 'screen',
        }}
      />

      {/* Main cursor - sharp SVG arrow */}
      <div
        ref={cursorRef}
        className="cyber-cursor-arrow"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 24,
          height: 28,
          pointerEvents: 'none',
          zIndex: 99999,
          willChange: 'transform',
          filter: `drop-shadow(0 0 4px ${accent}) drop-shadow(0 0 8px ${accentDim})`,
          transition: 'filter 0.3s',
        }}
      >
        {/* SVG razor-sharp arrow pointing top-left */}
        <svg
          width="24"
          height="28"
          viewBox="0 0 24 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          {/* Arrow body - ultra-sharp faceted polygon */}
          <path
            d="M1 1L9.5 27L12.5 17.5L23 14L1 1Z"
            fill={accent}
            fillOpacity={0.9}
            stroke={accent}
            strokeWidth={1}
            strokeLinejoin="miter"
          />
          {/* Inner highlight - razor edge gleam */}
          <path
            d="M3 4L8.5 23L11 16L20 13.5L3 4Z"
            fill="white"
            fillOpacity={0.15}
          />
          {/* Tip accent */}
          <path
            d="M1 1L5 3L3 5Z"
            fill="white"
            fillOpacity={0.6}
          />
        </svg>
      </div>
    </>
  );
}
