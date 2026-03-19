import { useRef, useCallback, useEffect, type RefObject } from 'react';

/**
 * Applies a 3D holographic tilt effect to a card element.
 *
 * - Desktop: reacts to `onMouseMove` / `onMouseLeave` (JSX props).
 * - Mobile:  a global passive `touchmove` observer checks if the finger
 *            is over the card, even if the touch started somewhere else
 *            (e.g. the user is scrolling the page and their finger passes
 *            over the card). The effect resets when the finger leaves.
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

  /* ── Shared math ──────────────────────────────────────────── */
  const applyTilt = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;

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
  }, []);

  /* ── Desktop handlers ─────────────────────────────────────── */
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => applyTilt(e.clientX, e.clientY),
    [applyTilt]
  );

  const onMouseLeave = useCallback(() => resetTilt(), [resetTilt]);

  /* ── Mobile: global passive touch observer ─────────────────── */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only on coarse-pointer (touch) devices
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (!isTouch) return;

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      const rect = el.getBoundingClientRect();
      const insideX = touch.clientX >= rect.left && touch.clientX <= rect.right;
      const insideY = touch.clientY >= rect.top && touch.clientY <= rect.bottom;

      if (insideX && insideY) {
        applyTilt(touch.clientX, touch.clientY);
      } else if (activeRef.current) {
        resetTilt();
      }
    };

    const handleTouchEnd = () => {
      resetTilt();
    };

    // Global listeners — `passive: true` never blocks scrolling
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [applyTilt, resetTilt]);

  return { ref, onMouseMove, onMouseLeave };
}
