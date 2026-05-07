import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { playHoverTick } from '@/lib/audio';

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
  const targetRef = useRef({ x: -100, y: -100 }); // raw mouse position
  const hoveringRef = useRef(false);
  const clickingRef = useRef(false);
  const rafRef = useRef<number>(0);

  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const accentDim = theme === 'redteam' ? 'rgba(255,0,51,0.3)' : theme === 'light' ? 'rgba(0,102,204,0.3)' : 'rgba(0,212,255,0.3)';

  // ── Animation loop - smooth LERP following ──
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

    posRef.current.x += (targetRef.current.x - posRef.current.x) * lerpCursor;
    posRef.current.y += (targetRef.current.y - posRef.current.y) * lerpCursor;

    const trailX = parseFloat(trail.dataset.x || '-100');
    const trailY = parseFloat(trail.dataset.y || '-100');
    const newTrailX = trailX + (targetRef.current.x - trailX) * lerpTrail;
    const newTrailY = trailY + (targetRef.current.y - trailY) * lerpTrail;
    trail.dataset.x = String(newTrailX);
    trail.dataset.y = String(newTrailY);

    cursor.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px) ${
      clickingRef.current ? 'scale(0.8)' : hoveringRef.current ? 'scale(1.3)' : 'scale(1)'
    }`;
    trail.style.transform = `translate(${newTrailX}px, ${newTrailY}px) ${
      hoveringRef.current ? 'scale(1.8)' : 'scale(1)'
    }`;

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (isTouchDevice) return;

    // Hide native cursor
    document.documentElement.classList.add('cyber-cursor-active');

    const onMouseMove = (e: MouseEvent) => {
      targetRef.current.x = e.clientX;
      targetRef.current.y = e.clientY;
    };

    const onMouseDown = () => { clickingRef.current = true; };
    const onMouseUp = () => { clickingRef.current = false; };

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'A' ||
        target.tagName === 'BUTTON' ||
        target.closest('a') ||
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.classList.contains('cursor-pointer')
      ) {
        if (!hoveringRef.current) playHoverTick();
        hoveringRef.current = true;
      }
    };

    const onMouseOut = () => {
      hoveringRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    document.addEventListener('mouseout', onMouseOut, { passive: true });

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      document.documentElement.classList.remove('cyber-cursor-active');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  // Don't render on mobile / touch
  if (isTouchDevice) return null;

  return (
    <>
      {/* Trail - soft glow circle that follows slowly */}
      <div
        ref={trailRef}
        data-x="-100"
        data-y="-100"
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
