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

  /* ── Mobile: global passive touch observer ───────────────────
     DISABLED - the global touchmove listener calls getBoundingClientRect()
     on every touch move, causing layout thrash during scroll. The tilt
     effect via scrolling also feels unnatural on touch. If a deliberate
     tap-tilt is ever desired, use touch-start on the element itself. */
  // (no global touch listeners - desktop onMouseMove/onMouseLeave are enough)

  return { ref, onMouseMove, onMouseLeave };
}
