/**
 * Haptic feedback utility - triggers vibration on mobile devices
 * that support the Vibration API. Silent no-op on desktop.
 *
 * The Vibration API requires a user gesture (touch/click) before it works.
 * We eagerly register a one-shot listener on document so the very first
 * micro-touch (even accidental) unlocks vibration for the entire session.
 */

const patterns: Record<string, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [15, 40, 15],
  error: [30, 50, 30, 50, 30],
};

let unlocked = false;

/** Try to unlock the Vibration API - called on first user gesture */
function tryUnlock() {
  if (unlocked) return;
  try {
    // A 1ms vibrate unlocks the API for the rest of the page lifetime
    if (navigator.vibrate?.(1)) {
      unlocked = true;
    }
  } catch { /* not available */ }
}

// Register one-shot unlock listeners as early as possible
if (typeof document !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
  const events = ['touchstart', 'pointerdown', 'click'] as const;
  const handler = () => {
    tryUnlock();
    if (unlocked) {
      events.forEach((e) => document.removeEventListener(e, handler, true));
    }
  };
  // Capture phase = fires before anything else, passive = no scroll block
  events.forEach((e) => document.addEventListener(e, handler, { capture: true, passive: true, once: false }));
}

export function haptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

  try {
    navigator.vibrate(patterns[style]);
  } catch {
    // Vibrate API not available or blocked - silent fail
  }
}
