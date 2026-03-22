import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon, Globe } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptic';

/**
 * Floating top-right controls: Language toggle + Theme toggle.
 * Appears only after boot completes.
 */
export default function FloatingControls() {
  const booted = useAppStore((s) => s.booted);
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const toggleLightMode = useAppStore((s) => s.toggleLightMode);

  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const isLight = theme === 'light';

  const handleLangToggle = () => {
    haptic('light');
    setLanguage(language === 'en' ? 'it' : 'en');
  };

  const handleThemeToggle = () => {
    haptic('light');
    toggleLightMode();
  };

  return (
    <AnimatePresence>
      {booted && (
        <motion.div
          className="floating-controls"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ delay: 1.8, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Language toggle */}
          <button
            onClick={handleLangToggle}
            className="fc-badge"
            title={language === 'en' ? 'Passa a Italiano' : 'Switch to English'}
            aria-label={language === 'en' ? 'Switch to Italian' : 'Switch to English'}
          >
            <Globe size={14} style={{ color: accent }} />
            <span className="fc-label">{language.toUpperCase()}</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={handleThemeToggle}
            className="fc-badge"
            title={isLight ? 'Dark mode' : 'Light mode'}
            aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            <motion.span
              key={isLight ? 'moon' : 'sun'}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              {isLight
                ? <Moon size={14} style={{ color: accent }} />
                : <Sun size={14} style={{ color: accent }} />}
            </motion.span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
