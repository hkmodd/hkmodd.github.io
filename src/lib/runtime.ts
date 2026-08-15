/** Engine / compositor budget. Chromium hides taxes Gecko invoices in full. */

export const isGecko =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('-moz-appearance', 'none')
    : typeof navigator !== 'undefined' && /Gecko\/|Firefox\//.test(navigator.userAgent);

export function preferWebGPU(): boolean {
  if (typeof window === 'undefined') return false;
  const forced = new URLSearchParams(window.location.search).get('neural');
  if (forced === 'gl') return false;
  if (forced === 'gpu') return true;
  // Firefox WebGPU is still a research backend. Three TSL on it stutters.
  if (isGecko) return false;
  return true;
}

export function stampRuntimeClass(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('gecko', isGecko);
}
