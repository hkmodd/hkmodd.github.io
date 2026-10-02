/* ═══════════════════════════════════════════════════════════════════
   OFFSCREEN ANIMATION PAUSE

   An infinite CSS animation keeps the document "animating" whether or not
   anyone can see it: Chrome services its style every frame. Measured idle at
   the top of the page: ~238 style recalcs/s, of which ~150/s came from the
   divider pulses, the terminal's breathing border and its cursor — all
   several screens away.

   One IntersectionObserver. Every infinite, time-based CSS animation is
   paused while its element is off screen (with a margin, so it is already
   running before it scrolls in) and played when it returns. Scroll- and
   view-timeline animations are left alone: they cost nothing at rest.

   A fixed layer is always "intersecting", even faded out. Such a subtree
   names a stand-in with `data-anim-proxy="<selector>"`: its animations follow
   that element's visibility instead (the hero follows its in-flow spacer,
   which leaves the screen only after the hero has dissolved).

   Only animations this module paused are ever played again — calling play()
   on a CSSAnimation pins its play state, so we never touch one we did not
   stop (e.g. the CRT sweep, which `.tab-hidden` pauses through CSS).
   ═══════════════════════════════════════════════════════════════════ */

const byEl = new Map<Element, Set<Animation>>();
const seen = new WeakSet<Animation>();
const pausedByUs = new WeakSet<Animation>();
const visibleEl = new WeakMap<Element, boolean>();
let io: IntersectionObserver | null = null;
let scanQueued = false;

function apply(a: Animation, visible: boolean) {
  if (visible) {
    if (pausedByUs.has(a)) {
      pausedByUs.delete(a);
      a.play();
    }
  } else if (a.playState === 'running') {
    a.pause();
    pausedByUs.add(a);
  }
}

function scan() {
  scanQueued = false;
  if (!io) return;
  for (const a of document.getAnimations()) {
    if (seen.has(a)) continue;
    if (typeof CSSAnimation === 'undefined' || !(a instanceof CSSAnimation)) continue;
    if (a.timeline !== document.timeline) continue;
    const effect = a.effect as KeyframeEffect | null;
    if (!effect || effect.getTiming().iterations !== Infinity) continue;
    const host = effect.target;
    if (!host) continue;
    const scope = host.closest('[data-anim-proxy]');
    const el = (scope && document.querySelector(scope.getAttribute('data-anim-proxy')!)) || host;
    seen.add(a);
    let set = byEl.get(el);
    if (!set) {
      set = new Set();
      byEl.set(el, set);
      io.observe(el);
    }
    set.add(a);
    const v = visibleEl.get(el);
    if (v !== undefined) apply(a, v);
  }
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(scan);
}

/** Idempotent. Picks up animations as they start (mounts, theme swaps). */
export function startOffscreenAnimationPause(): () => void {
  if (io || typeof IntersectionObserver === 'undefined' || !document.getAnimations) return () => {};
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        visibleEl.set(e.target, e.isIntersecting);
        const set = byEl.get(e.target);
        if (!set) continue;
        for (const a of set) {
          if (a.playState === 'idle') {
            // Cancelled (element unmounted or animation-name changed).
            set.delete(a);
            continue;
          }
          apply(a, e.isIntersecting);
        }
        if (set.size === 0) {
          byEl.delete(e.target);
          io?.unobserve(e.target);
        }
      }
    },
    { rootMargin: '25% 0px' },
  );
  document.addEventListener('animationstart', queueScan, true);
  queueScan();
  return () => {
    document.removeEventListener('animationstart', queueScan, true);
    io?.disconnect();
    io = null;
    byEl.clear();
  };
}
