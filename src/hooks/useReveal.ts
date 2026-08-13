import { useEffect, useRef, type RefObject } from 'react';

/**
 * Single shared IntersectionObserver for scroll-reveal fallback.
 * Primary path is CSS `animation-timeline: view()` (see .reveal in index.css).
 * This module only runs on browsers without scroll-driven animations.
 *
 * One observer, passive, rAF-coalesced. Every card/section reuses it.
 */

export interface RevealOpts {
  delay?: number;
  duration?: number;
  y?: number;
  once?: boolean;
  margin?: string;
}

type IntersectCb = (visible: boolean) => void;

const supportsViewTimeline =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline: view()');

let io: IntersectionObserver | null = null;
const callbacks = new Map<Element, { cb: IntersectCb; once: boolean }>();
const pending = new Map<Element, boolean>();
let raf = 0;

function flush() {
  raf = 0;
  pending.forEach((visible, el) => {
    const entry = callbacks.get(el);
    if (!entry) return;
    if (visible) el.classList.add('is-revealed');
    else if (!entry.once) el.classList.remove('is-revealed');
    entry.cb(visible);
    if (visible && entry.once) {
      io?.unobserve(el);
      callbacks.delete(el);
    }
  });
  pending.clear();
}

function ensureIO(rootMargin: string): IntersectionObserver {
  if (io) return io;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) pending.set(e.target, e.isIntersecting);
      if (!raf) raf = requestAnimationFrame(flush);
    },
    { rootMargin, threshold: 0.05 },
  );
  return io;
}

/** Observe any element. Returns an unobserve disposer. */
export function observeIntersect(
  el: Element | null,
  cb: IntersectCb,
  opts: { once?: boolean; margin?: string } = {},
): () => void {
  if (!el) return () => {};
  const once = opts.once ?? true;
  callbacks.set(el, { cb, once });
  ensureIO(opts.margin ?? '-80px 0px').observe(el);
  return () => {
    io?.unobserve(el);
    callbacks.delete(el);
    pending.delete(el);
  };
}

function applyVars(el: HTMLElement, opts: RevealOpts) {
  el.style.setProperty('--reveal-delay', `${opts.delay ?? 0}s`);
  el.style.setProperty('--reveal-duration', `${opts.duration ?? 0.6}s`);
  el.style.setProperty('--reveal-y', `${opts.y ?? 20}px`);
  el.classList.add('reveal');
}

/**
 * Attach reveal choreography to an element.
 * Pass an existing ref (tilt cards) or omit to get a new one.
 */
export function useReveal<T extends HTMLElement>(
  opts: RevealOpts = {},
  external?: RefObject<T | null>,
): RefObject<T | null> {
  const internal = useRef<T>(null);
  const ref = external ?? internal;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    applyVars(el, opts);
    if (supportsViewTimeline) return;
    return observeIntersect(el, () => {}, { once: opts.once ?? true, margin: opts.margin });
    // opts are compile-time constants per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

export { supportsViewTimeline };
