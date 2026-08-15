import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { sfx } from '@/lib/audio';
import ScrambledTitle from '@/components/ScrambledTitle';
import type { SkillItem } from '@/i18n/en';
import DeepDiveModal from '@/components/DeepDiveModal';
import { useReveal } from '@/hooks/useReveal';
import { useHolographicTilt } from '@/hooks/useHolographicTilt';
import { withViewTransition } from '@/lib/viewTransition';

type GroupId = 'recon' | 'defense' | 'engineering' | 'tooling';

const GROUPS: { id: GroupId; names: string[]; ink: string }[] = [
  { id: 'recon', names: ['Ghidra', 'Wireshark', 'OSINT'], ink: '#00e5ff' },
  { id: 'defense', names: ['Splunk / SIEM', 'Threat Intel', 'Incident Response'], ink: '#ff2a6d' },
  { id: 'engineering', names: ['Rust', 'Python', 'C / C++', 'TypeScript'], ink: '#ff6b00' },
  { id: 'tooling', names: ['Tauri', 'Context Engineering'], ink: '#ffe600' },
];

const INK: Record<string, string> = {
  ghidra: '#ff2a6d',
  wireshark: '#00e5ff',
  osint: '#ffe600',
  splunk: '#ff3d9a',
  'threat-intel': '#b537f2',
  'incident-response': '#39ff14',
  rust: '#ff6b00',
  python: '#ffd100',
  'c-cpp': '#4d7cff',
  typescript: '#00a8ff',
  tauri: '#ffb800',
  'context-eng': '#00ffd5',
};

const svg = {
  viewBox: '0 0 128 128',
  fill: 'none',
  width: '100%',
  height: '100%',
  'aria-hidden': true,
} as const;

/** Stencil marks — geometric, not brand forgeries. */
const GLYPHS: Record<string, ReactNode> = {
  ghidra: (
    <svg {...svg}>
      <circle cx="64" cy="64" r="56" stroke="#ff2a6d" strokeWidth="8" fill="rgba(255,42,109,0.12)" />
      <path d="M32 64 C 48 32, 80 32, 96 64 C 80 96, 48 96, 32 64 Z" stroke="#ff2a6d" strokeWidth="8" strokeLinejoin="round" />
      <circle cx="64" cy="64" r="14" fill="#ff2a6d" />
      <path d="M64 8V24 M64 104V120" stroke="#ff2a6d" strokeWidth="8" strokeLinecap="round" />
    </svg>
  ),
  wireshark: (
    <svg {...svg}>
      <polygon points="64,6 122,64 64,122 6,64" fill="#005E9C" stroke="#00e5ff" strokeWidth="4" />
      <path d="M48 78 Q 54 44 76 32 Q 74 56 86 78 Z" fill="#FFFFFF" />
      <path d="M32 86 Q 48 74 64 86 T 96 86" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
    </svg>
  ),
  osint: (
    <svg {...svg}>
      <circle cx="64" cy="64" r="50" stroke="#ffe600" strokeWidth="8" />
      <circle cx="64" cy="64" r="30" stroke="#ffe600" strokeWidth="6" strokeDasharray="12 12" />
      <path d="M64 8v120M8 64h120" stroke="#ffe600" strokeWidth="4" opacity="0.35" />
      <circle cx="84" cy="44" r="10" fill="#ff2a6d" />
      <path d="M64 64l20-20" stroke="#ff2a6d" strokeWidth="8" strokeLinecap="round" />
    </svg>
  ),
  splunk: (
    <svg {...svg}>
      <rect x="12" y="12" width="104" height="104" rx="20" stroke="#ff3d9a" strokeWidth="8" fill="rgba(255,61,154,0.08)" />
      <path d="M36 44l24 20-24 20" stroke="#ff3d9a" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M72 84h20" stroke="#ff3d9a" strokeWidth="12" strokeLinecap="round" />
    </svg>
  ),
  'threat-intel': (
    <svg {...svg}>
      <polygon points="64,12 112,32 112,80 64,120 16,80 16,32" stroke="#b537f2" strokeWidth="8" fill="rgba(181,55,242,0.08)" strokeLinejoin="round" />
      <circle cx="64" cy="64" r="16" fill="#ff2a6d" />
      <path d="M64 12v52 M16 32l48 32 M112 32L64 64" stroke="#b537f2" strokeWidth="6" opacity="0.55" />
    </svg>
  ),
  'incident-response': (
    <svg {...svg}>
      <path d="M64 12 L20 32 V64 C20 92, 40 112, 64 120 C88 112, 108 92, 108 64 V32 L64 12 Z" stroke="#39ff14" strokeWidth="8" fill="rgba(57,255,20,0.07)" strokeLinejoin="round" />
      <path d="M36 64h16l8-20 12 40 8-20h12" stroke="#ff2a6d" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  rust: (
    <svg {...svg}>
      <circle cx="64" cy="64" r="50" stroke="#ff6b00" strokeWidth="10" strokeDasharray="16 10" />
      <path d="M52 44h18c10 0 16 6 16 14s-6 14-16 14H52V44z" stroke="#ff6b00" strokeWidth="8" strokeLinejoin="round" />
      <path d="M52 92V44M68 72l16 20" stroke="#ff6b00" strokeWidth="8" strokeLinecap="square" />
    </svg>
  ),
  python: (
    <svg {...svg}>
      <path fill="#3776AB" d="M64 12C42 12 40 22 40 22v14h24v6H29s-22-1-22 23c0 23 12 25 12 25h10V72s0-15 15-15h21s14 0 14-14V29s1-17-15-17z" />
      <path fill="#FFD43B" d="M64 116c22 0 24-10 24-10V92H64v-6h36s22 1 22-23c0-23-12-25-12-25h-10v14s0 15-15 15H64s-14 0-14 14v12s-1 17 15 17z" />
      <circle fill="#FFF" cx="47" cy="26" r="5" />
      <circle fill="#FFF" cx="81" cy="102" r="5" />
    </svg>
  ),
  'c-cpp': (
    <svg {...svg}>
      <polygon points="64,6 116,36 116,92 64,122 12,92 12,36" fill="#004482" stroke="#4d7cff" strokeWidth="4" />
      <path d="M58 84A22 22 0 1 1 58 44" stroke="white" strokeWidth="12" strokeLinecap="round" />
      <path d="M72 64H92 M82 54V74" stroke="white" strokeWidth="8" strokeLinecap="round" />
      <path d="M94 54H114 M104 44V64" stroke="white" strokeWidth="8" strokeLinecap="round" />
    </svg>
  ),
  typescript: (
    <svg {...svg}>
      <rect x="8" y="8" width="112" height="112" rx="12" fill="#3178C6" />
      <path d="M36 64H60 M48 64V96" stroke="white" strokeWidth="12" strokeLinecap="square" />
      <path d="M96 66 C84 60 76 66 84 74 L88 78 C96 86 84 100 72 94" stroke="white" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
    </svg>
  ),
  tauri: (
    <svg {...svg}>
      <defs>
        <linearGradient id="tauriInk" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC131" />
          <stop offset="1" stopColor="#FF7A00" />
        </linearGradient>
      </defs>
      <circle cx="64" cy="64" r="56" fill="url(#tauriInk)" />
      <rect x="36" y="40" width="56" height="16" rx="8" fill="#FFFFFF" />
      <rect x="56" y="40" width="16" height="56" rx="8" fill="#FFFFFF" />
    </svg>
  ),
  'context-eng': (
    <svg {...svg}>
      <path d="M64 16 L16 40 L64 64 L112 40 Z" fill="rgba(0,255,213,0.22)" stroke="#00ffd5" strokeWidth="6" strokeLinejoin="round" />
      <path d="M16 64 L64 88 L112 64" stroke="#00ffd5" strokeWidth="6" strokeLinejoin="round" opacity="0.6" />
      <path d="M16 88 L64 112 L112 88" stroke="#00ffd5" strokeWidth="6" strokeLinejoin="round" opacity="0.3" />
      <circle cx="64" cy="40" r="8" fill="#fff" />
    </svg>
  ),
};

function Glyph({ iconKey }: { iconKey: string }) {
  return <>{GLYPHS[iconKey] ?? GLYPHS['context-eng']}</>;
}

const SkillCard = memo(function SkillCard({
  skill,
  delay,
  onClick,
}: {
  skill: SkillItem;
  delay: number;
  onClick: () => void;
}) {
  const { ref: tiltRef, onMouseMove, onMouseLeave } = useHolographicTilt<HTMLButtonElement>(7);
  useReveal({ delay, duration: 0.45, y: 22 }, tiltRef);
  const ink = INK[skill.icon] ?? '#00e5ff';

  return (
    <motion.button
      type="button"
      ref={tiltRef}
      layoutId={`skill-card-${skill.name}`}
      className="arsenal-card"
      style={{ '--ink': ink } as CSSProperties}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}

      onClick={onClick}
    >
      <span className="arsenal-card__glyph" aria-hidden>
        <Glyph iconKey={skill.icon} />
      </span>
      <span className="arsenal-card__copy">
        <strong>{skill.name}</strong>
        <em>{skill.desc}</em>
      </span>
    </motion.button>
  );
});

function ArsenalHeader({ title, kicker }: { title: string; kicker: string }) {
  const ref = useReveal<HTMLDivElement>({ duration: 0.55, y: 16 });
  return (
    <div ref={ref} className="arsenal-head">
      <p className="arsenal-stamp">{kicker}</p>
      <h2 className="arsenal-title" data-text={title}>
        <ScrambledTitle text={title} />
      </h2>
    </div>
  );
}

export default function Arsenal() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const handleOpenModal = (name: string) => {
    sfx.open();
    withViewTransition(() => setSelectedSkill(name));
  };

  const handleCloseModal = () => {
    sfx.close();
    withViewTransition(() => setSelectedSkill(null));
  };

  const selected = t.arsenal.skills.find((s) => s.name === selectedSkill);

  return (
    <>
      <section id="arsenal" className="arsenal py-24 px-6 max-w-6xl mx-auto relative">
        <div className="arsenal__wash" aria-hidden />

        <ArsenalHeader title={t.arsenal.title.toUpperCase()} kicker={t.kicker.arsenal} />

        <div className="arsenal-stack relative z-10">
          {GROUPS.map((group) => {
            const matched = t.arsenal.skills.filter((s) => group.names.includes(s.name));
            if (matched.length === 0) return null;
            const label = t.arsenal.groupLabels[group.id];
            return (
              <div key={group.id} className="arsenal-group" style={{ '--ink': group.ink } as CSSProperties}>
                <span className="arsenal-group__ghost" aria-hidden>
                  {label}
                </span>
                <h3 className="arsenal-group__label">{label}</h3>
                <div className="arsenal-grid">
                  {matched.map((s, i) => (
                    <SkillCard
                      key={s.name}
                      skill={s}
                      delay={i * 0.05}
                      onClick={() => handleOpenModal(s.name)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {selectedSkill && selected && (
          <DeepDiveModal
            skillName={selectedSkill}
            icon={<Glyph iconKey={selected.icon} />}
            onClose={handleCloseModal}
            accent={INK[selected.icon] ?? accent}
          />
        )}
      </AnimatePresence>
    </>
  );
}
