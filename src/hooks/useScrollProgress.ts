import { useEffect, useRef } from 'react';
import { subscribeScroll } from '@/lib/scrollProgress';

/* ═══════════════════════════════════════════════════════════════════
   useScrollProgress — React binding for the global scroll listener.

   Pass a callback; it fires once on mount with the current progress, then on
   every scroll frame. The callback is held in a ref so consumers can read
   fresh store/closure state inside it WITHOUT resubscribing (and without it
   being a dependency).

   `enabled` is the escape hatch for scroll-linked visuals that have been
   handed to the compositor via `animation-timeline: scroll()`. Passing false
   keeps the hook call unconditional (Rules of Hooks) while attaching nothing.
   When every subscriber opts out, `subscribeScroll` never attaches its
   window listeners at all — the scroll path stays completely free of JS.
   ═══════════════════════════════════════════════════════════════════ */

export function useScrollProgress(
  cb: (progress: number, scrollY: number) => void,
  enabled = true,
): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!enabled) return;
    // subscribeScroll fires the listener immediately with current state.
    return subscribeScroll((progress, scrollY) => cbRef.current(progress, scrollY));
  }, [enabled]);
}
