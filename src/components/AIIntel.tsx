import { motion } from 'motion/react';
import { Brain, Cpu, Bot, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n';
import { parseInlineMarkup } from '@/lib/parseInlineMarkup';

export default function AIIntel() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const booted = useAppStore((s) => s.booted);

  if (!booted || !t.aiIntel) return null;

  const accent = theme === 'redteam' ? '#ff0033' : '#00d4ff';
  const accentGlow = theme === 'redteam' ? 'rgba(255,0,51,0.08)' : 'rgba(0,212,255,0.08)';

  const icons = [Brain, Cpu, Bot, Sparkles];

  return (
    <section id="ai-intel" className="relative py-16 sm:py-28 px-4 sm:px-6">
      {/* Backdrop glow */}
      <div
        className="section-backdrop"
        style={{ top: '30%', left: '50%', transform: 'translateX(-50%)' }}
      />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8 sm:mb-14"
        >
          <h2
            className="section-heading text-3xl sm:text-4xl font-black tracking-tight"
            style={{ color: accent }}
          >
            {t.aiIntel.title}
          </h2>
          <p className="mt-4 text-text-muted text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            {t.aiIntel.subtitle}
          </p>
        </motion.div>

        {/* Cards grid */}
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          {t.aiIntel.cards.map((card, idx) => {
            const Icon = icons[idx % icons.length];
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="dossier-card group"
                style={{
                  borderColor: `${accent}15`,
                }}
              >
                {/* Card header with icon */}
                <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
                  <div
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: accentGlow,
                      border: `1px solid ${accent}20`,
                    }}
                  >
                    <Icon size={14} className="sm:hidden" style={{ color: accent }} />
                    <Icon size={16} className="hidden sm:block" style={{ color: accent }} />
                  </div>
                  <span
                    className="font-mono text-[10px] tracking-[0.2em] uppercase"
                    style={{ color: `${accent}99` }}
                  >
                    {card.header}
                  </span>
                </div>

                {/* Card title */}
                <h3 className="text-base sm:text-lg font-bold text-text mb-1.5 sm:mb-2 leading-snug">
                  {card.title}
                </h3>

                {/* Card body */}
                <p className="text-text-muted text-[13px] sm:text-sm leading-relaxed">
                  {parseInlineMarkup(card.body, { color: accent })}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
