/** Single write path for theme attrs. html AND .app-root must stay in sync:
 *  the inline anti-FOUC script stamps <html>, CSS is `[data-theme=…]`,
 *  and leaving html stale after a toggle is how light "stuck" after dark. */
export function applyThemeToDom(theme: 'default' | 'redteam' | 'light') {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const root = document.querySelector('.app-root');
  const apply = (el: Element | null) => {
    if (!el) return;
    if (theme === 'default') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  };
  apply(html);
  apply(root);
}

export function withThemeTransition(commit: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(commit);
    return;
  }
  commit();
}
