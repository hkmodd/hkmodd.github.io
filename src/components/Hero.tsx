import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Send } from 'lucide-react';
import { GithubIcon, LinkedinIcon } from '@/components/BrandIcons';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import { haptic } from '@/lib/haptic';

export default function Hero() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const booted = useAppStore((s) => s.booted);
  const transitioning = useAppStore((s) => s.redTeamTransitioning);
  const toggleRedTeam = useAppStore((s) => s.toggleRedTeam);

  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const accentGlow = theme === 'redteam' ? 'rgba(255,0,51,0.15)' : theme === 'light' ? 'rgba(0,102,204,0.12)' : 'rgba(0,212,255,0.15)';

  const [armed, setArmed] = useState<number | null>(null);

  // --- Scroll-driven fadeout (synced with NeuralMesh bg via the shared listener) ---
  const spacerRef = useRef<HTMLDivElement>(null);
  const heroScrollRef = useRef<HTMLDivElement>(null);

  useScrollProgress((progress) => {
    const el = heroScrollRef.current;
    if (!el) return;
    const t = Math.min(progress / 0.7, 1);
    el.style.opacity = String(Math.max(1 - t, 0));
    el.style.transform = `translateY(${t * -120}px)`;
  });

  // --- Avatar glitch state ---
  const [avatarGlitch, setAvatarGlitch] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(
    theme === 'redteam' ? '/foto_profilo_red.webp' : '/foto_profilo.webp'
  );

  // Watch for red team transition → trigger glitch then swap image
  const prevThemeRef = useRef(theme);
  useEffect(() => {
    if (prevThemeRef.current !== theme) {
      prevThemeRef.current = theme;

      // Trigger glitch animation
      setAvatarGlitch(true);
      haptic('heavy');

      // Swap image quickly (150ms) so it doesn't lag behind the flash
      const swapTimer = setTimeout(() => {
        setAvatarSrc(
          theme === 'redteam' ? '/foto_profilo_red.webp' : '/foto_profilo.webp'
        );
        setAvatarGlitch(false);
      }, 150);

      return () => clearTimeout(swapTimer);
    }
  }, [theme]);

  // --- 7-tap avatar detection (MOBILE ONLY — desktop uses Konami code) ---
  const tapTimestamps = useRef<number[]>([]);
  const isMobileRef = useRef(
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );

  const handleAvatarTap = useCallback(() => {
    // Desktop: do nothing — Konami code is the only way
    if (!isMobileRef.current) return;

    const now = Date.now();
    tapTimestamps.current = tapTimestamps.current.filter((t) => now - t < 3000);
    tapTimestamps.current.push(now);
    const count = tapTimestamps.current.length;

    // Escalating haptic - grows more intense with each tap
    if (count <= 3) haptic('light');
    else if (count <= 5) haptic('medium');
    else haptic('heavy');

    // 7th tap - ACTIVATE
    if (count >= 7) {
      tapTimestamps.current = [];
      haptic('success');

      // Slight delay so the user feels the 7th impact before the transition
      setTimeout(() => {
        toggleRedTeam();
      }, 120);
    }
  }, [toggleRedTeam]);

  // --- Name display: real name vs HKMODD ---
  const displayName = theme === 'redteam' ? 'HKMODD' : t.hero.name;
  const firstName = displayName.split(' ')[0];
  const lastName = displayName.split(' ').slice(1).join(' ');

  if (!booted) return null;

  // Boot dissolve reveals the canvas; this stagger is the entrance into the
  // scene. LCP skeleton is already gone (html.booted) so we fade from empty.
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.35 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: 22 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
    },
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
          className="max-w-4xl w-full text-center relative z-10 will-change-transform"
        >
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="w-full"
          >
            {/* Profile image - spinning conic gradient ring + float + glitch + dopamine tap */}
            {/* Ring uses REAL DOM elements (not CSS pseudo-elements) for iOS Safari compatibility */}
            <motion.div variants={item} className="flex justify-center mb-5 sm:mb-8">
              <motion.div
                className="relative"
                onClick={handleAvatarTap}
                style={{ cursor: isMobileRef.current ? 'pointer' : 'default', borderRadius: '50%' }}
                initial={{ scale: 1 }}
                animate={{
                  y: [0, -6, 0, 4, 0],
                }}
                transition={{
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
                  width={176}
                  height={176}
                  fetchPriority="high"
                  decoding="async"
                  className={`hero-avatar relative z-10 rounded-full object-cover grayscale-[20%] transition-all duration-300 ${
                    avatarGlitch ? 'hero-avatar-glitch' : ''
                  }`}
                  style={{
                    border: `2px solid ${accent}40`,
                    boxShadow: `0 0 50px ${accentGlow}`,
                    objectPosition: '40% 20%',
                  }}
                />

                {/* Dots removed — easter egg should be truly hidden */}
              </motion.div>
            </motion.div>

            <motion.div variants={item} className="hero-status-wrap flex justify-center mb-4 sm:mb-6">
              <p className="chip-3d hero-status">{t.hero.status}</p>
            </motion.div>

            <motion.h1
              variants={item}
              className="hero-name"
              data-text={firstName}
              initial={transitioning ? { opacity: 0, y: -8, filter: 'blur(6px)' } : false}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="hero-name__first">{firstName}</span>
              {lastName && (
                <>
                  <br />
                  <span className="hero-name__last">{lastName}</span>
                </>
              )}
            </motion.h1>

            <motion.div variants={item} className="hero-punch" aria-label={t.hero.punch.join(' ')}>
              {t.hero.punch.map((word, i) => (
                <button
                  key={word}
                  type="button"
                  className={`hero-punch__word${armed === i ? ' is-live' : ''}`}
                  style={{ '--ink': ['#00e5ff', '#ffe600', '#ff2a6d'][i % 3] } as CSSProperties}
                  onPointerEnter={() => setArmed(i)}
                  onPointerLeave={() => setArmed(null)}
                  onClick={() => {
                    setArmed(i);
                    haptic('medium');
                  }}
                >
                  {word}
                </button>
              ))}
            </motion.div>

            {t.hero.proofLine && (
              <motion.p variants={item} className="proof-line">
                {t.hero.proofLine}
              </motion.p>
            )}

            <motion.div
              variants={item}
              className="hero-cta grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-3 mt-6 sm:mt-9 w-full max-w-sm sm:max-w-none mx-auto"
            >
              <a
                href="#contact"
                className="btn-cyber btn-cyber--primary col-span-2 sm:col-span-1"
                onClick={() => haptic('medium')}
              >
                <Send size={15} />
                <span>{t.hero.contact}</span>
              </a>
              <a
                href="https://github.com/hkmodd"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cyber"
                onClick={() => haptic('medium')}
              >
                <GithubIcon size={15} />
                <span>GitHub</span>
              </a>
              <a
                href="https://www.linkedin.com/in/gelmetti-sebastiano/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cyber"
                onClick={() => haptic('medium')}
              >
                <LinkedinIcon size={15} />
                <span>LinkedIn</span>
              </a>
            </motion.div>

            {/* Scroll indicator */}
            <motion.div
              variants={item}
              className="hero-scroll-hint mt-10 sm:mt-14 flex flex-col items-center gap-2"
            >
              <span className="hero-scroll-label">
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
