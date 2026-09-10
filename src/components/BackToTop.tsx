import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/i18n';
import { supportsScrollTimeline } from '@/lib/runtime';

/**
 * Floating back-to-top button.
 * Appears after scrolling past the Hero section (~1 viewport height).
 * Snaps instantly to top on click.
 *
 * Two paths, chosen once at module scope:
 *
 *  • Native — `.back-to-top[data-scroll-driven]` in index.css runs the whole
 *    entrance on a scroll timeline. No listener, no state, no reconciliation:
 *    crossing the threshold used to push a setState through React and mount a
 *    motion subtree on the scroll path. Now it is a compositor keyframe.
 *
 *  • Fallback — the original listener + AnimatePresence, for engines without
 *    scroll-driven animations.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const tickingRef = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (supportsScrollTimeline) return; // CSS owns visibility on this path
    const check = () => {
      const shouldShow = window.scrollY > window.innerHeight * 0.8;
      // Only setState when value actually changes (avoids unnecessary re-renders)
      setVisible((prev) => (prev === shouldShow ? prev : shouldShow));
      tickingRef.current = false;
    };
    const onScroll = () => {
      if (!tickingRef.current) {
        requestAnimationFrame(check);
        tickingRef.current = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    check();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const goTop = useCallback(() => {
    const hero = document.querySelector('[data-snap]') as HTMLElement | null;
    if (hero) {
      hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const icon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );

  if (supportsScrollTimeline) {
    // Always mounted. `visibility: hidden` in the animation's fill state keeps
    // it out of the a11y tree and out of hit-testing until it ramps in.
    return (
      <button
        className="back-to-top"
        data-scroll-driven=""
        onClick={goTop}
        aria-label={t.footer.backToTop}
        title={t.footer.backToTop}
      >
        {icon}
      </button>
    );
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          className="back-to-top"
          onClick={goTop}
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.8 }}
          transition={{ duration: 0.25 }}
          aria-label={t.footer.backToTop}
          title={t.footer.backToTop}
        >
          {icon}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
