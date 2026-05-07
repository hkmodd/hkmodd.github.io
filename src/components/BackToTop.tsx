import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/i18n';

/**
 * Floating back-to-top button.
 * Appears after scrolling past the Hero section (~1 viewport height).
 * Snaps instantly to top on click.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const tickingRef = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
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

  const goTop = () => {
    const hero = document.querySelector('[data-snap]') as HTMLElement | null;
    if (hero) {
      hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
