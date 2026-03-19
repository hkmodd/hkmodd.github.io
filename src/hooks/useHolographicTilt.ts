import { useRef, useCallback, useEffect, type RefObject } from 'react';

/**
 * Applies a 3D holographic tilt effect to a card element.
 *
 * - Desktop: reacts to `onMouseMove` / `onMouseLeave` (JSX props).
 * - Mobile:  uses element-scoped touch listeners (touchstart/touchmove/touchend)
 *            so the effect works when the finger is over the card without
 *            causing layout thrash from global listeners.
 */
export function useHolographicTilt<T extends HTMLElement = HTMLDivElement>(
  intensity: number = 15
): {
  ref: RefObject<T | null>;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
} {
  const ref = useRef<T>(null);
  const activeRef = useRef(false); // tracks if tilt is currently applied
  const rectCache = useRef<DOMRect | null>(null); // cached rect for touch perf

  /* ── Shared math ──────────────────────────────────────────── */
  const applyTilt = useCallback(
    (clientX: number, clientY: number, rect?: DOMRect) => {
      const el = ref.current;
      if (!el) return;

      const r = rect || el.getBoundingClientRect();
      const x = (clientX - r.left) / r.width;
      const y = (clientY - r.top) / r.height;

      const rotateX = (y - 0.5) * -intensity;
      const rotateY = (x - 0.5) * intensity;

      el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
      el.style.setProperty('--mouse-x', `${x * 100}%`);
      el.style.setProperty('--mouse-y', `${y * 100}%`);
      activeRef.current = true;
    },
    [intensity]
  );

  const resetTilt = useCallback(() => {
    const el = ref.current;
    if (!el || !activeRef.current) return;
    el.style.transform =
      'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    activeRef.current = false;
    rectCache.current = null;
  }, []);

  /* ── Desktop handlers ─────────────────────────────────────── */
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => applyTilt(e.clientX, e.clientY),
    [applyTilt]
  );

  const onMouseLeave = useCallback(() => resetTilt(), [resetTilt]);

  /* ── Mobile: element-scoped touch listeners ────────────────
     Uses touchstart to cache getBoundingClientRect() once, then
     touchmove uses the cached rect — zero layout thrash during
     scroll. Reduced intensity (0.6x) feels natural on touch. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const touchIntensity = 0.6; // softer tilt on mobile

    const onTouchStart = (e: TouchEvent) => {
      // Cache rect once at touch start — avoids reflow on every move
      rectCache.current = el.getBoundingClientRect();
      const touch = e.touches[0];
      if (touch && rectCache.current) {
        applyTilt(
          touch.clientX,
          touch.clientY,
          rectCache.current
        );
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch || !rectCache.current) return;

      // Check if finger is still over the element
      const r = rectCache.current;
      if (
        touch.clientX >= r.left &&
        touch.clientX <= r.right &&
        touch.clientY >= r.top &&
        touch.clientY <= r.bottom
      ) {
        // Use reduced intensity for natural mobile feel
        const rx = (touch.clientX - r.left) / r.width;
        const ry = (touch.clientY - r.top) / r.height;
        const rotX = (ry - 0.5) * -intensity * touchIntensity;
        const rotY = (rx - 0.5) * intensity * touchIntensity;

        el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02, 1.02, 1.02)`;
        el.style.setProperty('--mouse-x', `${rx * 100}%`);
        el.style.setProperty('--mouse-y', `${ry * 100}%`);
        activeRef.current = true;
      } else {
        resetTilt();
      }
    };

    const onTouchEnd = () => resetTilt();

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyTilt, resetTilt, intensity]);

  return { ref, onMouseMove, onMouseLeave };
}
