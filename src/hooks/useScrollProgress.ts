import { useEffect, useRef } from 'react';
import { subscribeScroll } from '@/lib/scrollProgress';

/* ═══════════════════════════════════════════════════════════════════
   useScrollProgress — React binding for the global scroll listener.

   Pass a callback; it fires once on mount with the current progress, then on
   every scroll frame. The callback is held in a ref so consumers can read
   fresh store/closure state inside it WITHOUT resubscribing (and without it
   being a dependency).
   ═══════════════════════════════════════════════════════════════════ */

export function useScrollProgress(
  cb: (progress: number, scrollY: number) => void,
): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    // subscribeScroll fires the listener immediately with current state.
    return subscribeScroll((progress, scrollY) => cbRef.current(progress, scrollY));
  }, []);
}
