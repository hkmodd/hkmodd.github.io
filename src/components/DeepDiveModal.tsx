import { useEffect, cloneElement } from 'react';
import { motion } from 'motion/react';
import { X, ChevronRight, Activity } from 'lucide-react';
import { playTypeTick } from '@/lib/audio';
import { ARSENAL_DEEP_DIVE } from '@/data/arsenalDeepDive';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

interface DeepDiveModalProps {
  skillName: string;
  icon: React.ReactNode;
  onClose: () => void;
  accent: string;
}

export default function DeepDiveModal({ skillName, icon, onClose, accent }: DeepDiveModalProps) {
  const { language } = useTranslation();
  const lang = language === 'en' ? 'En' : 'It';
  const data = ARSENAL_DEEP_DIVE[skillName];

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!data) return null;

  const descKey = `description${lang}` as keyof typeof data;
  const useCasesKey = `useCases${lang}` as keyof typeof data;

  const description = data[descKey] as string;
  const useCases = data[useCasesKey] as string[];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12"
      style={{ perspective: 1500 }}
    >
      {/* Glassmorphic Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xl cursor-pointer" 
        onClick={onClose}
      />

      {/* 3D Holographic Container - Pure GPU Transform for 60fps */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -20 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[95vw] md:w-[85vw] max-w-6xl max-h-[90vh] md:max-h-[80vh] overflow-hidden flex flex-col md:flex-row shadow-2xl"
        style={{
          background: 'rgba(5, 5, 5, 0.75)',
          border: `1px solid ${accent}20`,
          boxShadow: `0 30px 60px rgba(0,0,0,0.5), inset 0 1px 0 ${accent}20`,
          borderRadius: '24px',
          willChange: 'transform, opacity',
        }}
      >
        {/* Glow & Scanlines Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-30" 
             style={{ 
               background: `linear-gradient(180deg, transparent 0%, ${accent}20 50%, transparent 100%)`,
               backgroundSize: '100% 4px'
             }} 
        />

        {/* Huge Icon Background (Left Section) */}
        <div 
          className="relative md:w-[45%] p-10 md:p-14 flex flex-col justify-center items-center border-b md:border-b-0 md:border-r border-white/5 overflow-hidden"
          style={{ background: `radial-gradient(circle at center, ${accent}10 0%, transparent 80%)` }}
        >
          {/* Close Button Mobile */}
          <button 
            onClick={onClose}
            className="md:hidden absolute top-4 right-4 p-2 text-white/50 hover:text-white"
          >
            <X size={24} />
          </button>

          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
            className="w-40 h-40 md:w-64 md:h-64 flex items-center justify-center drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)]"
            style={{ willChange: 'transform, opacity' }}
          >
            {icon && cloneElement(icon as React.ReactElement, { width: '100%', height: '100%' })}
          </motion.div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-4xl md:text-5xl font-black font-mono tracking-tighter text-white text-center drop-shadow-lg"
          >
            {data.name.toUpperCase()}
          </motion.h2>
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-2 text-xs font-mono uppercase tracking-[0.2em] text-center"
            style={{ color: accent }}
          >
            {'//'} {data.subtitle}
          </motion.div>
        </div>

        {/* Content Section (Right) */}
        <div className="relative md:w-[55%] p-8 md:p-14 flex flex-col overflow-y-auto custom-scrollbar">
          {/* Close Button Desktop */}
          <button 
            onClick={onClose}
            className="hidden md:flex absolute top-6 right-6 p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all items-center justify-center backdrop-blur-md"
          >
            <X size={24} />
          </button>

          {/* Core Description */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-8"
          >
            <h3 className="text-xs font-mono tracking-[0.3em] text-white/30 mb-6 flex items-center gap-2 uppercase">
              <Activity size={14} /> System Overview
            </h3>
            <p className="text-base md:text-xl text-gray-300 leading-relaxed font-sans font-light">
              {description}
            </p>
          </motion.div>

          {/* Use Cases */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-8"
          >
            <h3 className="text-xs font-mono tracking-[0.3em] text-white/30 mb-6 flex items-center gap-2 uppercase">
              <ChevronRight size={14} /> Deployment Vectors
            </h3>
            <ul className="space-y-4">
              {useCases.map((uc, i) => (
                <li key={i} className="flex items-start gap-4 text-base text-gray-300 group">
                  <span className="mt-1 font-bold" style={{ color: accent }}>{'>>'}</span>
                  <span className="group-hover:text-white transition-colors leading-snug">{uc}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Tech Stats */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-auto pt-6 border-t border-white/10"
          >
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="text-[10px] font-mono tracking-widest text-white/30 mb-3 uppercase">Complexity Index</div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${data.techStats.complexity}%` }}
                    transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
                    className="h-full"
                    style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
                  />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono tracking-widest text-white/30 mb-3 uppercase">Integration Rate</div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${data.techStats.usage}%` }}
                    transition={{ delay: 0.7, duration: 1, ease: "easeOut" }}
                    className="h-full"
                    style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
