/**
 * Haptic feedback utility — triggers vibration on mobile devices
 * that support the Vibration API. Silent no-op on desktop.
 */
export function haptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

  const patterns: Record<typeof style, number | number[]> = {
    light: 10,
    medium: 25,
    heavy: 50,
    success: [15, 40, 15],
    error: [30, 50, 30, 50, 30],
  };

  try {
    navigator.vibrate(patterns[style]);
  } catch {
    // Vibrate API not available or blocked — silent fail
  }
}
