import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { haptic } from '@/lib/haptic';

export default function ResetButton() {
  const theme = useAppStore((s) => s.theme);
  const toggleRedTeam = useAppStore((s) => s.toggleRedTeam);
  const booted = useAppStore((s) => s.booted);

  const visible = booted && theme === 'redteam';

  const handleReset = () => {
    haptic('heavy');
    toggleRedTeam();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ delay: 1.5, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          onClick={handleReset}
          className="reset-button"
          title="Exit Red Team Mode"
        >
          <X size={12} />
          <span>RESET BLUE TEAM</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
