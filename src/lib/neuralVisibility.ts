/* ═══════════════════════════════════════════════════════════════════
   NEURAL VISIBILITY — "is the background canvas still on screen?"
   answered without touching the scroll path.

   The canvas frameloop has to pause once the dissolve reaches zero opacity,
   which used to mean a scroll listener recomputing progress every frame just
   to flip one boolean. The same question is pure geometry, so an
   IntersectionObserver can answer it and the browser can do the work off the
   main thread.

   A 1px sentinel sits in document flow at exactly `--dissolve-end`. The
   viewport spans [scrollY, scrollY + vh], so the sentinel intersects it iff
   `scrollY < --dissolve-end` — precisely the window in which the canvas has
   non-zero opacity. No rootMargin arithmetic, no thresholds, and the cutoff
   stays in sync with the CSS animation-range because both read the same
   custom property.
   ═══════════════════════════════════════════════════════════════════ */

type InViewListener = (inView: boolean) => void;

const listeners = new Set<InViewListener>();
let sentinel: HTMLDivElement | null = null;
let observer: IntersectionObserver | null = null;
// Seeded optimistic: the page opens at the top under the lock. Reading
// scrollY here instead forced a synchronous layout of whatever the staged
// sections had just mounted (~45 ms on a throttled phone). A deep link or a
// restored scroll is corrected by the observer's first callback, one frame on.
let inView = true;

function mount(): void {
  if (sentinel || typeof document === 'undefined') return;

  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('data-dissolve-sentinel', '');
  // Absolute + no ancestor offset ⇒ positioned in document coordinates.
  // 1px, unpainted, out of flow: it cannot affect layout or scroll height.
  el.style.cssText =
    'position:absolute;left:0;width:1px;height:1px;pointer-events:none;' +
    'top:var(--dissolve-end,70vh)';
  document.body.appendChild(el);
  sentinel = el;

  observer = new IntersectionObserver((entries) => {
    const next = entries[entries.length - 1].isIntersecting;
    if (next === inView) return;
    inView = next;
    // Snapshot — a subscriber unsubscribing mid-notify must not mutate the
    // live set under us.
    for (const fn of [...listeners]) fn(next);
  });
  observer.observe(el);
}

function unmount(): void {
  observer?.disconnect();
  observer = null;
  sentinel?.remove();
  sentinel = null;
}

/** True while the dissolve has not yet reached zero opacity. */
export function isCanvasInView(): boolean {
  return inView;
}

/**
 * Subscribe to canvas in-view transitions. Fires immediately with the current
 * state, then only on actual crossings. Returns an unsubscribe function; the
 * observer and its sentinel are torn down when the last subscriber leaves.
 */
export function subscribeCanvasInView(listener: InViewListener): () => void {
  mount();
  listeners.add(listener);
  listener(inView);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) unmount();
  };
}
