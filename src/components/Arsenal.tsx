import React, { memo } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import type { SkillItem } from '@/i18n/en';

/* ── Category → skill name mapping ─────────────────────────────── */
const CATEGORIES: [string, string[]][] = [
  ['RECON & ANALYSIS', ['Ghidra', 'Wireshark', 'OSINT']],
  ['SOC & DEFENSE', ['Splunk / SIEM', 'Threat Intel', 'Incident Response']],
  ['ENGINEERING', ['Rust', 'Python', 'C / C++', 'TypeScript']],
  ['TOOLING', ['Tauri', 'Context Engineering']],
];

/* ── Inline SVG icons (20×20, stroke-based, currentColor) ──────── */
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 20,
  height: 20,
};

const ICON_MAP: Record<string, React.ReactNode> = {
  /* Recon & Analysis */
  ghidra: (
    <svg {...svgProps}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7Z" />
      <circle cx="10" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="9" r="1" fill="currentColor" stroke="none" />
      <path d="M9 21h6M9 19h6" />
    </svg>
  ),
  wireshark: (
    <svg {...svgProps}>
      <path d="M2 8c3-4 5-2 7 1s5 4 8 0" />
      <path d="M2 14c3-4 5-2 7 1s5 4 8 0" />
      <path d="M17 4l3 3-3 3" />
      <circle cx="5" cy="18" r="2" />
    </svg>
  ),
  osint: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),

  /* SOC & Defense */
  splunk: (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 17v-4" />
      <path d="M11 17V9" />
      <path d="M15 17v-6" />
      <path d="M19 17V7" />
    </svg>
  ),
  'threat-intel': (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  ),
  'incident-response': (
    <svg {...svgProps}>
      <path d="M12 2L3 7v6c0 5.05 3.84 9.76 9 10.93C17.16 22.76 21 18.05 21 13V7l-9-5Z" />
      <path d="M13 7l-5 6h4l-1 5 5-6h-4l1-5" />
    </svg>
  ),

  /* Engineering */
  rust: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      <path d="M5.64 5.64l1.41 1.41M16.95 16.95l1.41 1.41M5.64 18.36l1.41-1.41M16.95 7.05l1.41-1.41" />
    </svg>
  ),
  python: (
    <svg {...svgProps}>
      <path d="M12 2C8 2 8 4 8 4v3h4.5M12 2c4 0 4 2 4 2v3h-4.5" />
      <path d="M7.5 9H4s-2 0-2 2v3c0 2 2 2 2 2h3" />
      <path d="M12 22c4 0 4-2 4-2v-3h-4.5M12 22c-4 0-4-2-4-2v-3h4.5" />
      <path d="M16.5 15H20s2 0 2-2v-3c0-2-2-2-2-2h-3" />
      <circle cx="10" cy="5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="14" cy="19" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  ),
  'c-cpp': (
    <svg {...svgProps}>
      <path d="M18 10a6 6 0 1 0 0 4" />
      <path d="M14 10h4M16 8v4" />
      <path d="M20 10h4M22 8v4" />
    </svg>
  ),
  typescript: (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 11v-1h6v1" />
      <path d="M11 10v6" />
      <path d="M15 12.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 1-1.5 1-1.5 2v.5" />
      <circle cx="16.5" cy="16.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),

  /* Tooling */
  tauri: (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path d="M3 13h18" />
      <circle cx="12" cy="8" r="3" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  'context-eng': (
    <svg {...svgProps}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.15" />
      <path d="M8 6h8M6 8v8M18 8v8M8 18h8" />
      <path d="M8 8l4 4M16 8l-4 4M8 16l4-4M16 16l-4-4" />
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
}: {
  skill: SkillItem;
  delay: number;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.35 }}
      className="arsenal-card"
      style={{ '--card-accent': accent } as React.CSSProperties}
    >
      <div className="arsenal-card-icon" style={{ color: accent }}>
        {getIcon(skill.icon)}
      </div>
      <div className="arsenal-card-body">
        <span className="arsenal-card-name">{skill.name}</span>
        <span className="arsenal-card-desc">{skill.desc}</span>
      </div>
    </motion.div>
  );
});

/* ── Arsenal Section ───────────────────────────────────────────── */
export default function Arsenal() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';

  return (
    <section id="arsenal" className="py-24 px-6 max-w-6xl mx-auto relative">
      {/* Ambient backdrop */}
      <div
        className="section-backdrop"
        style={{ top: '-10%', right: '-15%' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-14 relative z-10"
      >
        <h2
          className="text-3xl md:text-4xl font-black font-mono tracking-tight"
          style={{ color: accent }}
        >
          {'// '}{t.arsenal.title.toUpperCase()}
        </h2>
        <div className="h-[1px] mt-3 w-16" style={{ background: accent, opacity: 0.4 }} />
      </motion.div>

      <div className="space-y-10 relative z-10">
        {CATEGORIES.map(([category, skillNames], catIdx) => {
          const matched = t.arsenal.skills.filter((s) =>
            skillNames.includes(s.name)
          );
          if (matched.length === 0) return null;

          return (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: catIdx * 0.06 }}
            >
              <div className="category-header" style={{ color: accent }}>
                <span className="category-dot" style={{ background: accent }} />
                {category}
              </div>
              <div className="arsenal-grid">
                {matched.map((s, i) => (
                  <SkillCard
                    key={s.name}
                    skill={s}
                    delay={i * 0.04}
                    accent={accent}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
