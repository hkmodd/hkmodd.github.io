import { useCallback, useEffect, useLayoutEffect, type RefObject } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import { getScrollProgress } from '@/lib/scrollProgress';
import { supportsScrollTimeline } from '@/lib/runtime';
import { isCanvasInView, subscribeCanvasInView } from '@/lib/neuralVisibility';

/* ═══════════════════════════════════════════════════════════════════
   useNeuralFade — the background canvas' scroll dissolve, both paths.

   NeuralMeshGL and NeuralMeshGPU carried a byte-identical copy of this;
   it lives here once now.

   The dissolve has two halves that used to be computed together on every
   scroll frame:

     • the visual (opacity + translate on a full-screen fixed wrapper). On
       engines with scroll-driven animations this is `.neural-canvas
       [data-scroll-driven]` in index.css — writing those two inline styles
       from JS was invalidating a compositor layer that holds a live WebGL/
       WebGPU canvas, once per scroll frame.

     • the boolean that pauses the R3F frameloop. That one still has to reach
       JS, so it comes from an IntersectionObserver (lib/neuralVisibility)
       instead of from scroll offset.

   Fallback engines keep the original single-listener implementation intact.
   ═══════════════════════════════════════════════════════════════════ */

export function useNeuralFade(
  wrapperRef: RefObject<HTMLDivElement | null>,
  theme: string,
): void {
  /** Frameloop gate. Light theme and a hidden tab both force it off. */
  const syncVisible = useCallback((inView: boolean) => {
    const isLightTheme = useAppStore.getState().theme === 'light';
    const isVisible = !isLightTheme && inView && !document.hidden;
    if (useAppStore.getState().canvasVisible !== isVisible) {
      useAppStore.getState().setCanvasVisible(isVisible);
    }
  }, []);

  /** Fallback only: the exact curve `@keyframes neural-dissolve` runs natively. */
  const applyFade = useCallback(
    (progress: number) => {
      const el = wrapperRef.current;
      if (!el) return;

      const t = Math.min(progress / 0.7, 1);
      // Light mode: hide canvas entirely — white bg must stay pristine
      const isLightTheme = useAppStore.getState().theme === 'light';
      const baseOpacity = isLightTheme ? 0 : 0.8;
      const opacity = baseOpacity * (1 - t);

      el.style.opacity = String(Math.max(opacity, 0));
      el.style.transform = `translateY(${t * -120}px)`;

      syncVisible(opacity > 0.01);
    },
    [wrapperRef, syncVisible],
  );

  useScrollProgress((progress) => applyFade(progress), !supportsScrollTimeline);

  useEffect(() => {
    if (!supportsScrollTimeline) return;
    return subscribeCanvasInView(syncVisible);
  }, [syncVisible]);

  /** Re-derive after anything that changes the answer without a scroll. */
  const resync = useCallback(() => {
    if (supportsScrollTimeline) syncVisible(isCanvasInView());
    else applyFade(getScrollProgress());
  }, [applyFade, syncVisible]);

  // Keep the GL/GPU context mounted across theme toggles. Light only zeros
  // opacity + pauses the frameloop — unmounting left canvasVisible=false and a
  // remounted wasVisibleRef that never wrote the store back to true.
  useLayoutEffect(() => {
    resync();
  }, [theme, resync]);

  useEffect(() => {
    const sync = () => {
      document.documentElement.classList.toggle('tab-hidden', document.hidden);
      resync();
    };
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [resync]);
}
