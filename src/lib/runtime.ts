/** Engine / compositor budget. Chromium hides taxes Gecko invoices in full. */

export const isGecko =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('-moz-appearance', 'none')
    : typeof navigator !== 'undefined' && /Gecko\/|Firefox\//.test(navigator.userAgent);

/**
 * Native scroll-driven animations (`animation-timeline: scroll()`).
 *
 * When true, scroll-linked visuals are driven entirely by the compositor and
 * NO JS runs on the scroll path. Gecko is excluded on purpose: its
 * scroll-driven implementation still ticks on the main thread here and was
 * the source of the fling stutter we already fixed for `view()` timelines.
 */
export const supportsScrollTimeline =
  !isGecko &&
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline', 'scroll()');

/**
 * Native view-progress timelines (`animation-timeline: view()`), for effects
 * keyed to an element's own crossing of the viewport rather than to absolute
 * scroll offset. Same Gecko exclusion, same reason.
 */
export const supportsViewTimeline =
  !isGecko &&
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline', 'view()');

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
