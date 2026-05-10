import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { playHoverTick, playTypeTick } from '@/lib/audio';
import ScrambledTitle from '@/components/ScrambledTitle';
import type { SkillItem } from '@/i18n/en';
import DeepDiveModal from '@/components/DeepDiveModal';

/* ── Category → skill name mapping ─────────────────────────────── */
const CATEGORIES: [string, string[]][] = [
  ['RECON & ANALYSIS', ['Ghidra', 'Wireshark', 'OSINT']],
  ['SOC & DEFENSE', ['Splunk / SIEM', 'Threat Intel', 'Incident Response']],
  ['ENGINEERING', ['Rust', 'Python', 'C / C++', 'TypeScript']],
  ['TOOLING', ['Tauri', 'Context Engineering']],
];

/* ── Full Color SVGs (Premium Product Look) ──────── */
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  width: '100%',
  height: '100%',
};

const ICON_MAP: Record<string, React.ReactNode> = {
  /* Recon & Analysis */
  ghidra: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <circle cx="64" cy="64" r="56" stroke="#e63946" strokeWidth="8" fill="rgba(230,57,70,0.1)" />
      <path d="M32 64 C 48 32, 80 32, 96 64 C 80 96, 48 96, 32 64 Z" stroke="#e63946" strokeWidth="8" strokeLinejoin="round" />
      <circle cx="64" cy="64" r="14" fill="#e63946" />
      <path d="M64 8V24 M64 104V120" stroke="#e63946" strokeWidth="8" strokeLinecap="round" />
    </svg>
  ),
  wireshark: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <polygon points="64,6 122,64 64,122 6,64" fill="#005E9C" stroke="#1679A7" strokeWidth="4" />
      <path d="M48 78 Q 54 44 76 32 Q 74 56 86 78 Z" fill="#FFFFFF" />
      <path d="M32 86 Q 48 74 64 86 T 96 86" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
    </svg>
  ),
  osint: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <circle cx="64" cy="64" r="50" stroke="#2a9d8f" strokeWidth="8" />
      <circle cx="64" cy="64" r="30" stroke="#2a9d8f" strokeWidth="6" strokeDasharray="12 12" />
      <path d="M64 8v120M8 64h120" stroke="#2a9d8f" strokeWidth="4" opacity="0.3" />
      <circle cx="84" cy="44" r="10" fill="#e9c46a" />
      <path d="M64 64l20-20" stroke="#e9c46a" strokeWidth="8" strokeLinecap="round" />
    </svg>
  ),

  /* SOC & Defense */
  splunk: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <rect x="12" y="12" width="104" height="104" rx="20" stroke="#f72585" strokeWidth="8" fill="rgba(247,37,133,0.05)" />
      <path d="M36 44l24 20-24 20" stroke="#f72585" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M72 84h20" stroke="#f72585" strokeWidth="12" strokeLinecap="round" />
    </svg>
  ),
  'threat-intel': (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <polygon points="64,12 112,32 112,80 64,120 16,80 16,32" stroke="#7209b7" strokeWidth="8" fill="rgba(114,9,183,0.05)" strokeLinejoin="round" />
      <circle cx="64" cy="64" r="16" fill="#f72585" />
      <path d="M64 12v52 M16 32l48 32 M112 32L64 64" stroke="#7209b7" strokeWidth="6" opacity="0.5" />
    </svg>
  ),
  'incident-response': (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <path d="M64 12 L20 32 V64 C20 92, 40 112, 64 120 C88 112, 108 92, 108 64 V32 L64 12 Z" stroke="#00f5d4" strokeWidth="8" fill="rgba(0,245,212,0.05)" strokeLinejoin="round" />
      <path d="M36 64h16l8-20 12 40 8-20h12" stroke="#f15bb5" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  /* Engineering */
  rust: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <circle cx="64" cy="64" r="50" stroke="#f46623" strokeWidth="10" strokeDasharray="16 10" />
      <path d="M52 44h18c10 0 16 6 16 14s-6 14-16 14H52V44z" stroke="#f46623" strokeWidth="8" strokeLinejoin="round" />
      <path d="M52 92V44M68 72l16 20" stroke="#f46623" strokeWidth="8" strokeLinecap="square" />
    </svg>
  ),
  python: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <path fill="#3776AB" d="M64 12C42 12 40 22 40 22v14h24v6H29s-22-1-22 23c0 23 12 25 12 25h10V72s0-15 15-15h21s14 0 14-14V29s1-17-15-17z"/>
      <path fill="#FFD43B" d="M64 116c22 0 24-10 24-10V92H64v-6h36s22 1 22-23c0-23-12-25-12-25h-10v14s0 15-15 15H64s-14 0-14 14v12s-1 17 15 17z"/>
      <circle fill="#FFF" cx="47" cy="26" r="5"/>
      <circle fill="#FFF" cx="81" cy="102" r="5"/>
    </svg>
  ),
  'c-cpp': (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <polygon points="64,6 116,36 116,92 64,122 12,92 12,36" fill="#004482" stroke="#00599C" strokeWidth="4" />
      <path d="M58 84A22 22 0 1 1 58 44" stroke="white" strokeWidth="12" strokeLinecap="round" />
      <path d="M72 64H92 M82 54V74" stroke="white" strokeWidth="8" strokeLinecap="round" />
      <path d="M94 54H114 M104 44V64" stroke="white" strokeWidth="8" strokeLinecap="round" />
    </svg>
  ),
  typescript: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <rect x="8" y="8" width="112" height="112" rx="12" fill="#3178C6" />
      <path d="M36 64H60 M48 64V96" stroke="white" strokeWidth="12" strokeLinecap="square" />
      <path d="M96 66 C84 60 76 66 84 74 L88 78 C96 86 84 100 72 94" stroke="white" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
    </svg>
  ),

  /* Tooling */
  tauri: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <defs>
        <linearGradient id="tauriGrad" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC131" />
          <stop offset="1" stopColor="#FF7A00" />
        </linearGradient>
      </defs>
      <circle cx="64" cy="64" r="56" fill="url(#tauriGrad)" />
      <rect x="36" y="40" width="56" height="16" rx="8" fill="#FFFFFF" />
      <rect x="56" y="40" width="16" height="56" rx="8" fill="#FFFFFF" />
    </svg>
  ),
  'context-eng': (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <path d="M64 16 L16 40 L64 64 L112 40 Z" fill="rgba(0,212,255,0.2)" stroke="#00d4ff" strokeWidth="6" strokeLinejoin="round" />
      <path d="M16 64 L64 88 L112 64" stroke="#00d4ff" strokeWidth="6" strokeLinejoin="round" opacity="0.6" />
      <path d="M16 88 L64 112 L112 88" stroke="#00d4ff" strokeWidth="6" strokeLinejoin="round" opacity="0.3" />
      <circle cx="64" cy="40" r="8" fill="#fff" />
    </svg>
  ),
};

function getIcon(key: string): React.ReactNode {
  return ICON_MAP[key] ?? (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

/* ── Skill Card ────────────────────────────────────────────────── */
const SkillCard = memo(function SkillCard({
  skill,
  delay,
  accent,
  onClick,
}: {
  skill: SkillItem;
  delay: number;
  accent: string;
  onClick: () => void;
}) {
  return (
    <motion.div
      layoutId={`skill-card-${skill.name}`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm transition-all duration-500 hover:bg-white/10 hover:border-white/20 hover:shadow-2xl"
      style={{ '--card-accent': accent } as React.CSSProperties}
      onMouseEnter={playHoverTick}
      onClick={onClick}
    >
      {/* Soft Glow */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 120%, ${accent}30 0%, transparent 70%)` }}
      />
      
      <div className="relative p-6 md:p-8 flex flex-col items-center justify-center text-center h-full gap-5">
        <div className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center drop-shadow-xl transition-transform duration-500 group-hover:scale-110">
          {getIcon(skill.icon)}
        </div>
        <div>
          <h3 className="font-mono text-lg md:text-xl font-bold text-text tracking-tight mb-2">
            {skill.name}
          </h3>
          <p className="text-xs md:text-sm text-text-muted font-sans leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity max-w-[200px] mx-auto">
            {skill.desc}
          </p>
        </div>
      </div>
    </motion.div>
  );
});

/* ── Arsenal Section ───────────────────────────────────────────── */
export default function Arsenal() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const handleOpenModal = (name: string) => {
    playTypeTick();
    setSelectedSkill(name);
  };

  const handleCloseModal = () => {
    playHoverTick();
    setSelectedSkill(null);
  };

  return (
    <>
      <section id="arsenal" className="py-32 md:py-48 px-6 max-w-7xl mx-auto relative">
        {/* Ambient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{ 
            background: `radial-gradient(ellipse at 50% 50%, ${accent} 0%, transparent 60%)`,
            filter: 'blur(120px)',
            zIndex: 0
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-24 relative z-10 text-center flex flex-col items-center"
        >
          <div 
            className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full mb-6 backdrop-blur-md"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
            <span className="text-xs font-mono tracking-widest text-text-dim uppercase">Technical Core</span>
          </div>
          <h2
            className="text-4xl md:text-6xl font-black font-mono tracking-tighter"
            style={{ color: 'var(--color-text)' }}
          >
            <ScrambledTitle text={t.arsenal.title.toUpperCase()} />
          </h2>
          <div className="h-[2px] mt-8 w-24 mx-auto" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
        </motion.div>

        <div className="space-y-32 relative z-10">
        {CATEGORIES.map(([category, skillNames], catIdx) => {
          const matched = t.arsenal.skills.filter((s) =>
            skillNames.includes(s.name)
          );
          if (matched.length === 0) return null;

          return (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: catIdx * 0.1, duration: 0.8 }}
              className="flex flex-col gap-8"
            >
              <div className="flex items-center gap-4">
                <span className="w-8 h-[1px] opacity-30" style={{ background: accent }} />
                <h3 className="text-sm md:text-base font-mono tracking-[0.2em] text-text-dim uppercase">
                  {category}
                </h3>
                <span className="flex-1 h-[1px] opacity-10" style={{ background: accent }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {matched.map((s, i) => (
                  <SkillCard
                    key={s.name}
                    skill={s}
                    delay={i * 0.04}
                    accent={accent}
                    onClick={() => handleOpenModal(s.name)}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
      </section>

      <AnimatePresence>
        {selectedSkill && (
          <DeepDiveModal
            skillName={selectedSkill}
            icon={getIcon(t.arsenal.skills.find(s => s.name === selectedSkill)?.icon || '')}
            onClose={handleCloseModal}
            accent={accent}
          />
        )}
      </AnimatePresence>
    </>
  );
}
