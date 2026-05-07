import { useEffect, useRef } from 'react';
import { haptic } from '@/lib/haptic';

/**
 * Creates a "mechanical wheel" feeling on mobile devices.
 * Accumulates scroll delta and triggers a micro-vibration every X pixels.
 */
export function useMobileHapticScroll() {
  const accumulatedDelta = useRef(0);
  const lastScrollY = useRef(typeof window !== 'undefined' ? window.scrollY : 0);
  const ticking = useRef(false);

  useEffect(() => {
    // Only run on mobile touch devices
    const isTouchPrimary = matchMedia('(pointer: coarse)').matches;
    // Vibration API check
    if (!isTouchPrimary || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

    // Threshold in pixels before a "click" is felt. 
    // 60px feels like a standard mechanical mouse wheel notch.
    const NOTCH_THRESHOLD = 60; 

    const handleScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(() => {
          const currentY = window.scrollY;
          const delta = Math.abs(currentY - lastScrollY.current);
          lastScrollY.current = currentY;

          accumulatedDelta.current += delta;

          if (accumulatedDelta.current >= NOTCH_THRESHOLD) {
            // Trigger a very light micro-vibration
            haptic('light');
            // Keep the remainder for perfect precision
            accumulatedDelta.current = accumulatedDelta.current % NOTCH_THRESHOLD;
          }
          
          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
}
