/**
 * Resolves once the first contentful paint has been presented.
 *
 * Nothing lazy is visible under the lock — the hero waits for `entered`, the
 * controls for `booted`, the canvas and the sections sit behind the opaque
 * plate — so their chunks go out after the skeleton and the lock are on
 * screen instead of racing them for the wire. Neither rAF nor an idle
 * callback is a paint signal: both fire while the GPU process is still
 * presenting the first frame.
 */
let promise: Promise<void> | null = null;

export function afterFirstPaint(): Promise<void> {
  if (promise) return promise;
  promise = new Promise<void>((resolve) => {
    if (performance.getEntriesByName('first-contentful-paint').length) return resolve();
    // A tab opened in the background presents nothing until it is shown.
    const fallback = window.setTimeout(resolve, 1500);
    try {
      const po = new PerformanceObserver((list) => {
        if (!list.getEntriesByName('first-contentful-paint').length) return;
        po.disconnect();
        window.clearTimeout(fallback);
        resolve();
      });
      po.observe({ type: 'paint', buffered: true });
    } catch {
      resolve();
    }
  });
  return promise;
}

export function hasFirstPaint(): boolean {
  return performance.getEntriesByName('first-contentful-paint').length > 0;
}
