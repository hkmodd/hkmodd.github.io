import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptic';

export default function BootScreen() {
  const { t } = useTranslation();
  const setBooted = useAppStore((s) => s.setBooted);
  const theme = useAppStore((s) => s.theme);
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const accentColor = theme === 'redteam' ? '#ff0033' : '#00d4ff';
  const sessionId = useRef(String(Math.floor(Math.random() * 9000) + 1000));

  // Lock body scroll while boot screen is visible
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';

    return () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      html.style.overflow = '';
      body.style.overflow = '';
      html.style.height = '';
      body.style.height = '';
    };
  }, []);

  const runBoot = useCallback(() => {
    const bootLines = t.boot.lines;
    let i = 0;

    const interval = setInterval(() => {
      if (i < bootLines.length) {
        setLines((prev) => [...prev, bootLines[i]]);
        haptic('light');
        i++;
      } else {
        clearInterval(interval);
        haptic('success');
        setTimeout(() => setDone(true), 200);
        setTimeout(() => setBooted(true), 500);
      }
    }, 120);

    return () => clearInterval(interval);
  }, [t, setBooted]);

  useEffect(() => {
    return runBoot();
  }, [runBoot]);

  const progress = lines.length / t.boot.lines.length;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="boot-screen"
          style={{ background: '#030304' }}
          exit={{ opacity: 0, scale: 1.02, filter: 'blur(6px)' }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <div className="boot-screen__content">
            {/* Terminal lines */}
            <div
              className="font-mono text-xs sm:text-sm space-y-1.5"
              style={{ color: accentColor }}
            >
              {lines.map((line, idx) => {
                const isLast = idx === lines.length - 1 && idx === t.boot.lines.length - 1;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className={isLast ? 'font-bold text-sm sm:text-base mt-4 sm:mt-6' : 'opacity-60'}
                  >
                    <span className="opacity-40 mr-2 select-none">{'>'}&nbsp;</span>
                    {line}
                  </motion.div>
                );
              })}

              {/* Blinking cursor while loading */}
              {lines.length < t.boot.lines.length && (
                <span
                  className="inline-block w-2 h-4 ml-5"
                  style={{
                    backgroundColor: accentColor,
                    animation: 'terminal-cursor 1s step-end infinite',
                  }}
                />
              )}
            </div>

            {/* Progress bar */}
            <div
              className="mt-6 sm:mt-8 h-[2px] rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: accentColor }}
                initial={{ width: '0%' }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              />
            </div>

            {/* Session ID */}
            <div className="visitor-counter mt-4 sm:mt-5 text-right" style={{ color: accentColor }}>
              Session #{sessionId.current}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
