import { useEffect, useRef, useCallback } from 'react';

/**
 * useSnapScroll — Desktop-only section-snapping via wheel/keyboard.
 *
 * Tracks current section index explicitly (no guessing from scroll position).
 * Scroll down → snap one section at a time.
 * Scroll up  → accelerated: rapid up-scrolls jump straight to top.
 * Home/End   → instant jump to first/last section.
 * Mobile/touch → no-op (native scroll preserved).
 */

const SNAP_SELECTOR = '[data-snap]';
const COOLDOWN_MS   = 480;    // minimum ms between snaps
const UP_COOLDOWN   = 300;    // shorter cooldown for scrolling up
const MIN_DELTA     = 25;     // ignore tiny trackpad noise
const RAPID_WINDOW  = 1200;   // ms window for detecting rapid scroll intent
const RAPID_COUNT   = 3;      // wheel-up ticks within window → jump to top

export function useSnapScroll() {
  const currentIdx    = useRef(0);
  const snapLock      = useRef(false);
  const upTicks       = useRef<number[]>([]);   // timestamps of recent up-scrolls
  const cachedTargets = useRef<HTMLElement[]>([]);

  const getTargets = useCallback((): HTMLElement[] => {
    return Array.from(document.querySelectorAll<HTMLElement>(SNAP_SELECTOR));
  }, []);

  const updateTargets = useCallback(() => {
    cachedTargets.current = getTargets();
  }, [getTargets]);

  /**
   * Sync currentIdx from actual scroll position.
   * Called on mount and after natural scrolling (no snap lock).
   */
  const syncIndex = useCallback((targets: HTMLElement[]) => {
    const scrollY = window.scrollY;
    const vh = window.innerHeight;
    let best = 0;
    let bestDist = Infinity;

    for (let i = 0; i < targets.length; i++) {
      const top = targets[i].getBoundingClientRect().top + scrollY;
      const dist = Math.abs(top - scrollY - vh * 0.3);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    currentIdx.current = best;
  }, []);

  const snapTo = useCallback((targets: HTMLElement[], idx: number, cooldown = COOLDOWN_MS) => {
    const clamped = Math.max(0, Math.min(idx, targets.length - 1));
    if (clamped === currentIdx.current) return; // already there

    const el = targets[clamped];
    if (!el) return;

    currentIdx.current = clamped;
    snapLock.current = true;

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Release lock after animation completes
    setTimeout(() => {
      snapLock.current = false;
    }, cooldown);
  }, []);

  useEffect(() => {
    // Desktop-only: skip on actual touch devices
    const isTouchPrimary = matchMedia('(pointer: coarse)').matches && window.innerWidth < 768;
    if (isTouchPrimary) return;

    updateTargets();
    if (cachedTargets.current.length === 0) return;

    // Use MutationObserver to update targets if DOM changes (e.g. BootScreen unmounts, main content mounts)
    const observer = new MutationObserver(() => updateTargets());
    observer.observe(document.body, { childList: true, subtree: true });

    // Initialize index from current scroll position
    syncIndex(cachedTargets.current);

    const handleWheel = (e: WheelEvent) => {
      // Let horizontal scrolls pass
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // Ignore tiny trackpad noise
      if (Math.abs(e.deltaY) < MIN_DELTA) return;

      e.preventDefault();

      // Still locked from previous snap
      if (snapLock.current) return;

      const freshTargets = cachedTargets.current;
      if (freshTargets.length === 0) return;

      const direction = e.deltaY > 0 ? 1 : -1;

      if (direction === -1) {
        // ── SCROLLING UP: detect rapid intent ──
        const now = Date.now();
        upTicks.current.push(now);
        // Prune old ticks outside the window
        upTicks.current = upTicks.current.filter(t => now - t < RAPID_WINDOW);

        if (upTicks.current.length >= RAPID_COUNT) {
          // User is frantically scrolling up → jump straight to top
          upTicks.current = [];
          if (currentIdx.current > 0) {
            snapTo(freshTargets, 0, UP_COOLDOWN);
          }
          return;
        }

        // Normal single up-scroll with shorter cooldown
        const nextIdx = currentIdx.current - 1;
        if (nextIdx < 0) return;
        snapTo(freshTargets, nextIdx, UP_COOLDOWN);
      } else {
        // ── SCROLLING DOWN: normal one-section snap ──
        upTicks.current = []; // reset up-counter
        const nextIdx = currentIdx.current + 1;
        if (nextIdx >= freshTargets.length) return;
        snapTo(freshTargets, nextIdx);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const freshTargets = cachedTargets.current;
      if (freshTargets.length === 0) return;

      // Home / End → jump to first / last section
      if (e.key === 'Home') {
        e.preventDefault();
        if (!snapLock.current) snapTo(freshTargets, 0, UP_COOLDOWN);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        if (!snapLock.current) snapTo(freshTargets, freshTargets.length - 1);
        return;
      }

      let direction = 0;
      if (e.key === 'PageDown' || e.key === 'ArrowDown') direction = 1;
      if (e.key === 'PageUp' || e.key === 'ArrowUp') direction = -1;
      if (direction === 0) return;

      e.preventDefault();

      if (snapLock.current) return;

      const nextIdx = currentIdx.current + direction;
      if (nextIdx < 0 || nextIdx >= freshTargets.length) return;

      const cd = direction === -1 ? UP_COOLDOWN : COOLDOWN_MS;
      snapTo(freshTargets, nextIdx, cd);
    };

    // Passive resync: when user scrolls normally (e.g. scrollbar drag),
    // update the index after the snap lock expires.
    // Throttled with rAF to avoid DOM queries on every scroll event.
    let scrollTicking = false;
    const handleScroll = () => {
      if (!snapLock.current && !scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(() => {
          syncIndex(cachedTargets.current);
          scrollTicking = false;
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [getTargets, syncIndex, snapTo]);
}
