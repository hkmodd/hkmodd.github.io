import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Skull, Globe2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n';

const navLinks = [
  { id: 'hero', label: 'Home' },
  { id: 'arsenal', label: 'Arsenal' },
  { id: 'operations', label: 'Operations' },
  { id: 'identity', label: 'Identity' },
  { id: 'terminal', label: 'Terminal' },
];

export default function Navbar() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const toggleRedTeam = useAppStore((s) => s.toggleRedTeam);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const booted = useAppStore((s) => s.booted);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [activeSection, setActiveSection] = useState('hero');
  const accent = theme === 'redteam' ? '#ff0033' : '#00d4ff';

  // Scroll progress + active section tracking (rAF-guarded)
  useEffect(() => {
    const sectionIds = navLinks.map((l) => l.id);
    let rafId = 0;

    const onScroll = () => {
      if (rafId) return;          // skip if a frame is already queued
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const h = document.documentElement;
        const pct = h.scrollTop / (h.scrollHeight - h.clientHeight);
        setScrollPct(Math.min(1, Math.max(0, pct)));

        // Determine active section
        let current = 'hero';
        for (const id of sectionIds) {
          const el = document.getElementById(id);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top <= 200) current = id;
          }
        }
        setActiveSection(current);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (!booted) return null;

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <>
      <motion.nav
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5, ease: 'easeOut' }}
        className="fixed top-0 left-0 right-0 z-[9998] glass"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          {/* Logo */}
          <button
            onClick={() => scrollTo('hero')}
            className="font-mono text-base font-bold tracking-tight cursor-pointer transition-colors duration-200"
            style={{ color: accent }}
          >
            HKModd<span className="opacity-40">_</span>
          </button>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="relative font-mono text-[11px] tracking-widest uppercase px-3 py-1.5 rounded transition-colors duration-200 cursor-pointer"
                style={{
                  color: activeSection === id ? accent : 'var(--color-text-muted)',
                }}
              >
                {label}
                {activeSection === id && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-4 rounded-full"
                    style={{ background: accent }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            {/* Language toggle */}
            <button
              onClick={() => setLanguage(language === 'en' ? 'it' : 'en')}
              className="p-2 rounded-md hover:bg-white/5 transition-colors font-mono text-[10px] tracking-wider text-text-muted hover:text-text cursor-pointer flex items-center gap-1.5"
              title="Switch language"
            >
              <Globe2 size={14} />
              <span className="hidden sm:inline">{language.toUpperCase()}</span>
            </button>

            {/* Red team toggle */}
            <button
              onClick={toggleRedTeam}
              className="p-2 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
              title={theme === 'redteam' ? t.actions.resetTheme : 'Red Team Mode'}
            >
              <Skull
                size={15}
                style={{ color: theme === 'redteam' ? '#ff0033' : 'var(--color-text-dim)' }}
              />
            </button>

            {/* Mobile menu */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
            >
              {mobileOpen
                ? <X size={16} className="text-text" />
                : <Menu size={16} className="text-text-muted" />}
            </button>
          </div>
        </div>

        {/* Scroll progress */}
        <div
          className="scroll-progress"
          style={{ width: `${scrollPct * 100}%`, background: accent }}
        />
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed top-14 left-0 right-0 z-[9997] glass border-b border-border md:hidden"
          >
            <div className="flex flex-col p-4 gap-2">
              {navLinks.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="font-mono text-sm py-1.5 text-left transition-colors cursor-pointer"
                  style={{
                    color: activeSection === id ? accent : 'var(--color-text-muted)',
                  }}
                >
                  <span className="opacity-40 mr-2">▸</span>
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
