import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Github, Linkedin, Download, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n';
import { useScrambleText } from '@/hooks/useScrambleText';
import { haptic } from '@/lib/haptic';

export default function Hero() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const booted = useAppStore((s) => s.booted);
  const transitioning = useAppStore((s) => s.redTeamTransitioning);
  const toggleRedTeam = useAppStore((s) => s.toggleRedTeam);

  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const accentGlow = theme === 'redteam' ? 'rgba(255,0,51,0.15)' : theme === 'light' ? 'rgba(0,102,204,0.12)' : 'rgba(0,212,255,0.15)';

  const scrambledTitle = useScrambleText(t.hero.title, { speed: 40, delay: 1800 });

  // --- Scroll-driven fadeout via rAF (synced with NeuralMesh bg) ---
  const spacerRef = useRef<HTMLDivElement>(null);
  const heroScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    let ticking = false;

    const applyScroll = () => {
      const el = heroScrollRef.current;
      if (!el) return;

      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const progress = Math.min(scrollY / vh, 1);
      const t = Math.min(progress / 0.7, 1);

      const opacity = 1 - t;
      const yShift = t * -120;

      el.style.opacity = String(Math.max(opacity, 0));
      el.style.transform = `translateY(${yShift}px)`;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        rafId = requestAnimationFrame(applyScroll);
        ticking = true;
      }
    };

    // Initial apply
    applyScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // --- Gradient text animation via raw rAF (bypasses CSS/WAAPI limits on iOS Safari) ---
  // ALL gradient styles (including color per-theme) are managed inside the rAF
  // so that React re-renders on theme change never conflict with the animation.
  const gradientRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let rafId = 0;
    const duration = 6000; // 6s full cycle

    const tick = (now: number) => {
      const el = gradientRef.current;
      if (el) {
        // Read theme from store each frame — avoids stale closure on theme switch
        const currentTheme = useAppStore.getState().theme;
        const gradient = currentTheme === 'redteam'
          ? 'linear-gradient(90deg, #ff0033 0%, #ff6b35 30%, #ff0033 60%, #ff6b35 80%, #ff0033 100%)'
          : currentTheme === 'light'
          ? 'linear-gradient(90deg, #0066cc 0%, #0ea5e9 30%, #0066cc 60%, #06b6d4 80%, #0066cc 100%)'
          : 'linear-gradient(90deg, #00d4ff 0%, #ff0033 30%, #00d4ff 60%, #00ff88 80%, #00d4ff 100%)';

        // Sine wave: smoothly oscillate 0% → 100% → 0% over `duration` ms
        const progress = (Math.sin((now / duration) * Math.PI * 2 - Math.PI / 2) + 1) / 2;

        // Apply ALL gradient styles every frame — prevents React re-render
        // from resetting backgroundPosition or backgroundClip mid-animation
        el.style.background = gradient;
        el.style.backgroundSize = '300% 100%';
        el.style.backgroundPosition = `${progress * 100}% 50%`;
        el.style.webkitBackgroundClip = 'text';
        (el.style as unknown as Record<string, string>).backgroundClip = 'text';
        el.style.webkitTextFillColor = 'transparent';
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- Avatar glitch state ---
  const [avatarGlitch, setAvatarGlitch] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(
    theme === 'redteam' ? '/foto_profilo_red.png' : '/foto_profilo.png'
  );

  // Watch for red team transition → trigger glitch then swap image
  const prevThemeRef = useRef(theme);
  useEffect(() => {
    if (prevThemeRef.current !== theme) {
      prevThemeRef.current = theme;

      // Trigger glitch animation
      setAvatarGlitch(true);
      haptic('heavy');

      // Swap image after glitch animation (800ms)
      const swapTimer = setTimeout(() => {
        setAvatarSrc(
          theme === 'redteam' ? '/foto_profilo_red.png' : '/foto_profilo.png'
        );
        setAvatarGlitch(false);
      }, 800);

      return () => clearTimeout(swapTimer);
    }
  }, [theme]);

  // --- 7-tap avatar detection (mobile red team trigger) ---
  const tapTimestamps = useRef<number[]>([]);
  const [tapBounce, setTapBounce] = useState(0);   // increments to trigger scale animation
  const [ringPulse, setRingPulse] = useState(0);    // 0-7 intensity level for glow ring
  const ringDecayRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleAvatarTap = useCallback(() => {
    const now = Date.now();
    tapTimestamps.current = tapTimestamps.current.filter((t) => now - t < 3000);
    tapTimestamps.current.push(now);
    const count = tapTimestamps.current.length;

    // Escalating haptic - grows more intense with each tap
    if (count <= 3) haptic('light');
    else if (count <= 5) haptic('medium');
    else haptic('heavy');

    // Trigger bounce animation (key change forces re-render)
    setTapBounce((p) => p + 1);

    // Update ring glow intensity
    setRingPulse(Math.min(count, 7));

    // Reset ring decay timer
    clearTimeout(ringDecayRef.current);
    ringDecayRef.current = setTimeout(() => {
      setRingPulse(0);
      tapTimestamps.current = [];
    }, 3200);

    // 7th tap - ACTIVATE
    if (count >= 7) {
      tapTimestamps.current = [];
      clearTimeout(ringDecayRef.current);
      haptic('success');

      // Slight delay so the user feels the 7th impact before the transition
      setTimeout(() => {
        setRingPulse(0);
        toggleRedTeam();
      }, 120);
    }
  }, [toggleRedTeam]);

  // Ring glow style - intensifies with tap count
  const ringGlowStyle = useMemo(() => {
    if (ringPulse === 0) return {};
    const intensity = ringPulse / 7;
    const color = theme === 'redteam' ? '0, 212, 255' : theme === 'light' ? '0, 102, 204' : '255, 0, 51'; // opposite = preview hint
    return {
      boxShadow: [
        `0 0 ${12 + intensity * 30}px rgba(${color}, ${0.15 + intensity * 0.5})`,
        `0 0 ${4 + intensity * 15}px rgba(${color}, ${0.1 + intensity * 0.3})`,
        `inset 0 0 ${2 + intensity * 8}px rgba(${color}, ${0.05 + intensity * 0.15})`,
      ].join(', '),
    };
  }, [ringPulse, theme]);

  // --- Name display: real name vs HKMODD ---
  const displayName = theme === 'redteam' ? 'HKMODD' : t.hero.name;
  const firstName = displayName.split(' ')[0];
  const lastName = displayName.split(' ').slice(1).join(' ');

  if (!booted) return null;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.8 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <>
      {/* ── Fixed Hero - visually behind everything ─────────────── */}
      <section
        id="hero"
        className="fixed inset-0 flex items-center justify-center px-6"
        style={{ zIndex: 1 }}
      >
        {/* Ambient backdrop glow */}
        <div
          className="section-backdrop"
          style={{ top: '10%', left: '50%', transform: 'translateX(-50%)' }}
        />

        <div
          ref={heroScrollRef}
          className="max-w-3xl w-full text-center relative z-10 will-change-transform"
        >
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="w-full"
          >
            {/* Profile image - spinning conic gradient ring + float + glitch + dopamine tap */}
            {/* Ring uses REAL DOM elements (not CSS pseudo-elements) for iOS Safari compatibility */}
            <motion.div variants={item} className="flex justify-center mb-14 sm:mb-12">
              <motion.div
                className="relative"
                onClick={handleAvatarTap}
                style={{ cursor: 'pointer', borderRadius: '50%', ...ringGlowStyle }}
                key={`bounce-${tapBounce}`}
                initial={{ scale: 1 }}
                animate={{
                  scale: [1, 1.12, 0.95, 1],
                  y: [0, -6, 0, 4, 0],
                }}
                transition={{
                  scale: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
                  y: { duration: 5, ease: 'easeInOut', repeat: Infinity },
                }}
              >
                {/* Spinning conic-gradient ring - REAL DOM element */}
                <motion.div
                  aria-hidden
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    inset: -4,
                    background: `conic-gradient(from 0deg, ${accent}, transparent 30%, ${theme === 'redteam' ? '#00d4ff' : theme === 'light' ? '#4299e1' : '#ff0033'} 50%, transparent 70%, ${accent} 100%)`,
                    opacity: 0.7,
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
                />

                {/* Soft outer glow - REAL DOM element */}
                <motion.div
                  aria-hidden
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    inset: -12,
                    background: `radial-gradient(circle, ${accentGlow} 0%, transparent 70%)`,
                  }}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
                />

                {/* Actual avatar image */}
                <img
                  src={avatarSrc}
                  alt={t.hero.name}
                  className={`relative z-10 w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover grayscale-[20%] transition-all duration-300 ${
                    avatarGlitch ? 'hero-avatar-glitch' : ''
                  }`}
                  style={{
                    border: `2px solid ${accent}40`,
                    boxShadow: `0 0 50px ${accentGlow}`,
                  }}
                />

                {/* Tap progress dots - appear around the ring as user taps */}
                {ringPulse > 0 && (
                  <div className="absolute inset-0 pointer-events-none z-20">
                    {Array.from({ length: Math.min(ringPulse, 6) }).map((_, i) => {
                      const angle = -90 + i * 60;
                      const rad = (angle * Math.PI) / 180;
                      const r = 58;
                      const color = theme === 'redteam' ? '#00d4ff' : theme === 'light' ? '#4299e1' : '#ff0033';
                      return (
                        <motion.span
                          key={i}
                          className="absolute w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.2, delay: 0.02 }}
                          style={{
                            background: color,
                            boxShadow: `0 0 6px ${color}`,
                            left: `calc(50% + ${Math.cos(rad) * r}px - 4px)`,
                            top: `calc(50% + ${Math.sin(rad) * r}px - 4px)`,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </motion.div>

            {/* Status badge */}
            <motion.div variants={item} className="flex justify-center mb-10 sm:mb-8">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full font-mono text-[9px] sm:text-[10px] tracking-widest uppercase"
                style={{
                  border: `1px solid rgba(0,255,136,0.15)`,
                  color: '#00ff88',
                  background: 'rgba(0,255,136,0.04)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full status-dot"
                  style={{ background: '#00ff88' }}
                />
                {t.hero.status}
              </div>
            </motion.div>

            {/* Name - gradient animated via raw rAF loop (CSS animations & WAAPI both fail on iOS Safari with background-clip:text) */}
            {/* All gradient styles are managed inside the rAF tick — the style prop only sets initial clip */}
            <motion.h1
              variants={item}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08]"
            >
              <motion.span
                ref={(el: HTMLSpanElement | null) => { gradientRef.current = el; }}
                className="inline-block"
                style={{
                  backgroundSize: '300% 100%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
                initial={transitioning ? { opacity: 0, y: -10, filter: 'blur(6px)' } : false}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{
                  opacity: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                  y: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                  filter: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                }}
              >
                {firstName}
              </motion.span>
              {lastName && (
                <>
                  <br />
                  <motion.span
                    className="text-text inline-block"
                    initial={transitioning ? { opacity: 0, y: 10, filter: 'blur(6px)' } : false}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {lastName}
                  </motion.span>
                </>
              )}
            </motion.h1>

            {/* Title (scrambled) */}
            <motion.p
              variants={item}
              className="font-mono text-xs sm:text-sm md:text-base mt-8 sm:mt-7 tracking-[0.2em] sm:tracking-[0.25em] uppercase"
              style={{ color: `${accent}cc` }}
            >
              {scrambledTitle}
            </motion.p>

            {/* Bio */}
            {t.hero.bio && (
              <motion.p
                variants={item}
                className="text-text-muted text-sm sm:text-base md:text-lg mt-8 sm:mt-6 max-w-xl mx-auto leading-relaxed px-2"
              >
                {t.hero.bio}
              </motion.p>
            )}

            {/* CTA row */}
            <motion.div
              variants={item}
              className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-4 sm:gap-4 mt-14 sm:mt-12 w-full max-w-sm sm:max-w-none mx-auto"
            >
              <a
                href="https://github.com/hkmodd"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cyber"
                onClick={() => haptic('medium')}
              >
                <Github size={15} />
                <span>GitHub</span>
              </a>
              <a
                href="https://www.linkedin.com/in/gelmetti-sebastiano/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cyber"
                onClick={() => haptic('medium')}
              >
                <Linkedin size={15} />
                <span>LinkedIn</span>
              </a>
              <a
                href="/CV_Sebastiano_Gelmetti.pdf"
                download
                className="btn-cyber btn-cyber--primary col-span-2 sm:col-span-1 justify-self-center"
                onClick={() => haptic('medium')}
              >
                <Download size={15} />
                <span>{t.hero.cv}</span>
              </a>
            </motion.div>

            {/* Scroll indicator */}
            <motion.div
              variants={item}
              className="mt-20 sm:mt-20 flex flex-col items-center gap-2"
            >
              <span className="font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-text-dim">
                {t.hero.scroll}
              </span>
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ChevronDown size={16} className="text-text-dim" />
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Scroll spacer - occupies 100vh of document flow ──── */}
      {/* This pushes main-content down by one screen height.    */}
      {/* As the user scrolls past it, the fixed Hero fades out   */}
      {/* and the main-content (with a solid bg) slides over it. */}
      <div ref={spacerRef} className="hero-spacer" style={{ height: '100vh' }} />
    </>
  );
}
