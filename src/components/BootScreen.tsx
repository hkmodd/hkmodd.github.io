import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptic';
import { playBootSequence } from '@/lib/audio';

export default function BootScreen() {
  const { t } = useTranslation();
  const setBooted = useAppStore((s) => s.setBooted);
  const theme = useAppStore((s) => s.theme);
  const engineReady = useAppStore((s) => s.engineReady);
  const [lines, setLines] = useState<string[]>([]);
  const [linesDone, setLinesDone] = useState(false);
  const [graceExpired, setGraceExpired] = useState(false);
  const [done, setDone] = useState(false);

  const accentColor = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const sessionId = useRef(String(Math.floor(Math.random() * 9000) + 1000));

  // Lock body scroll only while the veil is up. BootScreen now stays
  // mounted for the exit fade, so this must release on `done`, not unmount.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (done) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      html.style.overflow = '';
      body.style.overflow = '';
      html.style.height = '';
      body.style.height = '';
      return;
    }
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';
  }, [done]);

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
        setLinesDone(true);
      }
    }, 120);

    return () => clearInterval(interval);
  }, [t]);

  // The boot screen is a WARM-UP window, not just theatre: while it types,
  // the engine chunk streams in and the GPU pipelines compile behind it.
  // Release only when the engine has produced real frames — capped by a
  // grace timeout so a slow network can never hold the page hostage.
  useEffect(() => {
    if (!linesDone) return;
    const grace = setTimeout(() => setGraceExpired(true), 4000);
    return () => clearTimeout(grace);
  }, [linesDone]);

  useEffect(() => {
    if (!linesDone || !(engineReady || graceExpired)) return;
    haptic('success');
    if (import.meta.env.DEV) {
      console.log(`[boot] released — engineReady=${engineReady} grace=${graceExpired}`);
    }
    // Mount the hero UNDER the veil first, then dissolve the boot.
    // App used to unmount this component on `booted`, which aborted the
    // exit fade — keep BootScreen mounted (App always renders it).
    const tHero = setTimeout(() => setBooted(true), 80);
    const tVeil = setTimeout(() => setDone(true), 140);
    return () => {
      clearTimeout(tHero);
      clearTimeout(tVeil);
    };
  }, [linesDone, engineReady, graceExpired, setBooted]);

  useEffect(() => {
    // Only play boot sequence once. On mobile, this may be silent due to autoplay rules.
    // Audio will be globally unlocked on the first touch/scroll later.
    playBootSequence();
    return runBoot();
  }, [runBoot]);

  const progress = lines.length / t.boot.lines.length;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="boot-screen"
          style={{ background: '#000000' }}
          exit={{ opacity: 0, scale: 1.015, filter: 'blur(8px)' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
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

              {/* Engine warm-up overflow: shown only when pipeline compilation
                  outlives the typewriter — the wait is real work, say so */}
              {linesDone && !engineReady && !graceExpired && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="opacity-60"
                >
                  <span className="opacity-40 mr-2 select-none">{'>'}&nbsp;</span>
                  {t.boot.warming}
                  <span
                    className="inline-block w-2 h-3 ml-2"
                    style={{
                      backgroundColor: accentColor,
                      animation: 'terminal-cursor 1s step-end infinite',
                    }}
                  />
                </motion.div>
              )}

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
