/** Progressive View Transitions wrapper. Silent no-op where unsupported. */

type VTDoc = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export function withViewTransition(update: () => void): void {
  const doc = document as VTDoc;
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(update);
    return;
  }
  update();
}
