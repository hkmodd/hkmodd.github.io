import { useRef, useCallback, type RefObject } from 'react';

/**
 * Applies a 3D holographic tilt effect to a card element.
 *
 * Desktop only. Touch tilt fights the native pan — the finger becomes a
 * transform handle instead of a scroll gesture, and the page feels stuck.
 */
export function useHolographicTilt<T extends HTMLElement = HTMLDivElement>(
  intensity: number = 7
): {
  ref: RefObject<T | null>;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
} {
  const ref = useRef<T>(null);
  const activeRef = useRef(false); // tracks if tilt is currently applied
  const rectCache = useRef<DOMRect | null>(null); // cached rect for touch perf
  const rafId = useRef(0); // rAF ID for touch throttling

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

      el.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.012, 1.012, 1.012)`;
      el.style.setProperty('--mouse-x', `${x * 100}%`);
      el.style.setProperty('--mouse-y', `${y * 100}%`);
      el.dataset.tilting = '';
      activeRef.current = true;
    },
    [intensity]
  );

  const resetTilt = useCallback(() => {
    const el = ref.current;
    if (!el || !activeRef.current) return;
    cancelAnimationFrame(rafId.current);
    el.style.transform =
      'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    delete el.dataset.tilting;
    activeRef.current = false;
    rectCache.current = null;
  }, []);

  /* ── Desktop handlers ─────────────────────────────────────── */
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (!rectCache.current) {
        rectCache.current = el.getBoundingClientRect();
        el.style.willChange = 'transform';
      }
      const x = e.clientX;
      const y = e.clientY;
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => applyTilt(x, y, rectCache.current ?? undefined));
    },
    [applyTilt]
  );

  const onMouseLeave = useCallback(() => {
    resetTilt();
    if (ref.current) ref.current.style.willChange = '';
  }, [resetTilt]);

  return { ref, onMouseMove, onMouseLeave };
}
