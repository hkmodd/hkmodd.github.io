import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
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

  const accent = theme === 'redteam' ? '#ff0033' : '#00d4ff';
  const accentGlow = theme === 'redteam' ? 'rgba(255,0,51,0.15)' : 'rgba(0,212,255,0.15)';

  const scrambledTitle = useScrambleText(t.hero.title, { speed: 40, delay: 1800 });

  // --- Scroll-driven fadeout (track the spacer div for scroll progress) ---
  const spacerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: spacerRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.7], [0, -80]);
  const heroScale = useTransform(scrollYProgress, [0, 0.7], [1, 0.95]);

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

    // Escalating haptic — grows more intense with each tap
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

    // 7th tap — ACTIVATE
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

  // Ring glow style — intensifies with tap count
  const ringGlowStyle = useMemo(() => {
    if (ringPulse === 0) return {};
    const intensity = ringPulse / 7;
    const color = theme === 'redteam' ? '0, 212, 255' : '255, 0, 51'; // opposite = preview hint
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
      {/* ── Fixed Hero — visually behind everything ─────────────── */}
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

        <motion.div
          style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
          className="max-w-3xl w-full text-center relative z-10 will-change-transform"
        >
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="w-full"
          >
            {/* Profile image — spinning conic gradient ring + float + glitch + dopamine tap */}
            <motion.div variants={item} className="flex justify-center mb-10 sm:mb-8">
              <motion.div
                className="profile-ring relative"
                onClick={handleAvatarTap}
                style={{ cursor: 'pointer', borderRadius: '50%', ...ringGlowStyle }}
                key={`bounce-${tapBounce}`}
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.12, 0.95, 1] }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <img
                  src={avatarSrc}
                  alt={t.hero.name}
                  className={`w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover grayscale-[20%] transition-all duration-300 ${
                    avatarGlitch ? 'hero-avatar-glitch' : ''
                  }`}
                  style={{
                    border: `2px solid ${accent}40`,
                    boxShadow: `0 0 50px ${accentGlow}`,
                  }}
                />

                {/* Tap progress dots — appear around the ring as user taps */}
                {ringPulse > 0 && (
                  <div className="absolute inset-0 pointer-events-none">
                    {Array.from({ length: Math.min(ringPulse, 6) }).map((_, i) => {
                      const angle = -90 + i * 60; // distribute around circle
                      const rad = (angle * Math.PI) / 180;
                      const r = 58; // radius from center (slightly outside ring on mobile)
                      const color = theme === 'redteam' ? '#00d4ff' : '#ff0033';
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
            <motion.div variants={item} className="flex justify-center mb-8 sm:mb-6">
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

            {/* Name — animated gradient text, morphs in red team */}
            <motion.h1
              variants={item}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08]"
            >
              <motion.span
                key={firstName}
                className="text-gradient-animate inline-block"
                initial={transitioning ? { opacity: 0, y: -10, filter: 'blur(6px)' } : false}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {firstName}
              </motion.span>
              {lastName && (
                <>
                  <br />
                  <motion.span
                    key={lastName}
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
              className="font-mono text-xs sm:text-sm md:text-base mt-6 sm:mt-5 tracking-[0.2em] sm:tracking-[0.25em] uppercase"
              style={{ color: `${accent}cc` }}
            >
              {scrambledTitle}
            </motion.p>

            {/* Bio */}
            <motion.p
              variants={item}
              className="text-text-muted text-sm sm:text-base md:text-lg mt-8 sm:mt-6 max-w-xl mx-auto leading-relaxed px-2"
            >
              {t.hero.bio}
            </motion.p>

            {/* CTA row */}
            <motion.div
              variants={item}
              className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-4 sm:gap-4 mt-10 sm:mt-10 w-full max-w-sm sm:max-w-none mx-auto"
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
              className="mt-16 sm:mt-16 flex flex-col items-center gap-2"
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
        </motion.div>
      </section>

      {/* ── Scroll spacer — occupies 100vh of document flow ──── */}
      {/* This pushes main-content down by one screen height.    */}
      {/* As the user scrolls past it, the fixed Hero fades out   */}
      {/* and the main-content (with a solid bg) slides over it. */}
      <div ref={spacerRef} className="hero-spacer" style={{ height: '100vh' }} />
    </>
  );
}
