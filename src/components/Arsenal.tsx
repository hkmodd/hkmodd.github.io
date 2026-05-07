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
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="26" stroke="#e63946" strokeWidth="4" fill="rgba(230,57,70,0.05)" />
      <path d="M32 16c-8 0-16 6-16 16s8 16 16 16 16-6 16-16-8-16-16-16z" stroke="#e63946" strokeWidth="3" />
      <circle cx="32" cy="32" r="5" fill="#e63946" />
      <path d="M32 6v10M32 48v10" stroke="#e63946" strokeWidth="4" strokeLinecap="round" />
    </svg>
  ),
  wireshark: (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <path d="M12 54C12 54 22 26 32 26C42 26 52 54 52 54" stroke="#0077b6" strokeWidth="6" strokeLinecap="round" fill="rgba(0,119,182,0.05)" />
      <path d="M32 26V10L40 18" stroke="#00b4d8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="54" r="4" fill="#90e0ef" />
    </svg>
  ),
  osint: (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="26" stroke="#2a9d8f" strokeWidth="4" />
      <circle cx="32" cy="32" r="14" stroke="#2a9d8f" strokeWidth="3" strokeDasharray="6 6" />
      <path d="M32 6v52M6 32h52" stroke="#2a9d8f" strokeWidth="2" opacity="0.4" />
      <circle cx="42" cy="22" r="5" fill="#e9c46a" />
      <path d="M32 32l10-10" stroke="#e9c46a" strokeWidth="4" />
    </svg>
  ),

  /* SOC & Defense */
  splunk: (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <path d="M16 22l16 10-16 10" stroke="#f72585" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 42h10" stroke="#f72585" strokeWidth="8" strokeLinecap="round" />
      <circle cx="32" cy="32" r="26" stroke="rgba(247,37,133,0.15)" strokeWidth="4" />
    </svg>
  ),
  'threat-intel': (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="24" stroke="#7209b7" strokeWidth="5" strokeDasharray="10 8" />
      <circle cx="32" cy="32" r="8" fill="#f72585" />
      <path d="M32 4v8M32 52v8M4 32h8M52 32h8" stroke="#7209b7" strokeWidth="5" strokeLinecap="round" />
    </svg>
  ),
  'incident-response': (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <path d="M32 6L10 16v16c0 14.5 10 28 22 32 12-4 22-17.5 22-32V16L32 6z" stroke="#00f5d4" strokeWidth="4" fill="rgba(0,245,212,0.05)" strokeLinejoin="round" />
      <path d="M32 22v10" stroke="#f15bb5" strokeWidth="6" strokeLinecap="round" />
      <circle cx="32" cy="42" r="4" fill="#f15bb5" />
    </svg>
  ),

  /* Engineering */
  rust: (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="24" stroke="#f46623" strokeWidth="5" strokeDasharray="8 6" />
      <path d="M26 22h10c5 0 8 3 8 7s-3 7-8 7H26v-14z" stroke="#f46623" strokeWidth="4" />
      <path d="M26 46V22M34 36l8 10" stroke="#f46623" strokeWidth="4" strokeLinecap="square" />
    </svg>
  ),
  python: (
    <svg {...svgProps} viewBox="0 0 128 128" fill="none">
      <path fill="#3776AB" d="M64 10C42 10 40 20 40 20v10h24v4H29s-22-1-22 23c0 23 12 25 12 25h10V68s0-15 15-15h21s14 0 14-14V27s1-17-15-17z"/>
      <path fill="#FFD43B" d="M64 118c22 0 24-10 24-10V98H64v-4h36s22 1 22-23c0-23-12-25-12-25h-10v14s0 15-15 15H64s-14 0-14 14v12s-1 17 15 17z"/>
      <circle fill="#FFF" cx="47" cy="24" r="4"/>
      <circle fill="#FFF" cx="81" cy="104" r="4"/>
    </svg>
  ),
  'c-cpp': (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <path d="M34 16c-8 0-14 6-14 16s6 16 14 16c5 0 9-2 12-5" stroke="#00599C" strokeWidth="6" strokeLinecap="round" />
      <path d="M44 32h10M49 27v10" stroke="#00599C" strokeWidth="4" strokeLinecap="round" />
      <path d="M54 32h6M57 29v6" stroke="#00599C" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  typescript: (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="6" width="52" height="52" rx="6" fill="#3178C6" />
      <path d="M36 48c-4 0-7-2-7-5v-2h12v2c0 2-2 5-5 5z" fill="white" />
      <path d="M36 32V28H22v3h6v17h6V31h2z" fill="white" />
    </svg>
  ),

  /* Tooling */
  tauri: (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="26" stroke="#FFC131" strokeWidth="5" />
      <path d="M22 32c0 5 4 10 10 10s10-5 10-10" stroke="#FFC131" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 42v10" stroke="#FFC131" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="22" r="6" fill="#FFC131" />
    </svg>
  ),
  'context-eng': (
    <svg {...svgProps} viewBox="0 0 64 64" fill="none">
      <path d="M32 6L6 20l26 14 26-14-26-14z" stroke="#00d4ff" strokeWidth="4" fill="rgba(0,212,255,0.1)" strokeLinejoin="round" />
      <path d="M6 44l26 14 26-14M6 32l26 14 26-14" stroke="#00d4ff" strokeWidth="4" opacity="0.6" strokeLinejoin="round" />
      <circle cx="32" cy="20" r="5" fill="#fff" />
      <circle cx="32" cy="34" r="3" fill="#fff" opacity="0.8" />
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
          <h3 className="font-mono text-lg md:text-xl font-bold text-white tracking-tight mb-2">
            {skill.name}
          </h3>
          <p className="text-xs md:text-sm text-gray-400 font-sans leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity max-w-[200px] mx-auto">
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
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
            <span className="text-xs font-mono tracking-widest text-white/70 uppercase">Technical Core</span>
          </div>
          <h2
            className="text-4xl md:text-6xl font-black font-mono tracking-tighter"
            style={{ color: '#fff' }}
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
                <h3 className="text-sm md:text-base font-mono tracking-[0.2em] text-white/50 uppercase">
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
