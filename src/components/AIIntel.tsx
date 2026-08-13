import { Brain, Cpu, Bot, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n';
import { parseInlineMarkup } from '@/lib/parseInlineMarkup';
import { playHoverTick } from '@/lib/audio';
import ScrambledTitle from '@/components/ScrambledTitle';
import DataCore from '@/components/canvas/DataCore';
import { useReveal } from '@/hooks/useReveal';

function AIHeader({ accent, title, subtitle }: { accent: string; title: string; subtitle: string }) {
  const ref = useReveal<HTMLDivElement>({ duration: 0.6, y: 20, margin: '-80px' });
  return (
    <div ref={ref} className="text-center mb-8 sm:mb-14">
      <h2
        className="section-heading text-3xl sm:text-4xl font-black tracking-tight"
        style={{ color: accent }}
      >
        <ScrambledTitle text={title} />
      </h2>
      <p className="mt-4 text-text-muted text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
        {subtitle}
      </p>
    </div>
  );
}

function IntelCard({
  idx,
  accent,
  accentGlow,
  header,
  title,
  body,
  Icon,
}: {
  idx: number;
  accent: string;
  accentGlow: string;
  header: string;
  title: string;
  body: string;
  Icon: typeof Brain;
}) {
  const ref = useReveal<HTMLDivElement>({ delay: idx * 0.1, duration: 0.5, y: 24, margin: '-60px' });
  return (
    <div
      ref={ref}
      className="dossier-card group"
      onMouseEnter={playHoverTick}
      style={{ borderColor: `${accent}15` }}
    >
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
          {header}
        </span>
      </div>
      <h3 className="text-base sm:text-lg font-bold text-text mb-1.5 sm:mb-2 leading-snug">
        {title}
      </h3>
      <p className="text-text-muted text-[13px] sm:text-sm leading-relaxed">
        {parseInlineMarkup(body, { color: accent })}
      </p>
    </div>
  );
}

export default function AIIntel() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const booted = useAppStore((s) => s.booted);

  if (!booted || !t.aiIntel) return null;

  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const accentGlow = theme === 'redteam' ? 'rgba(255,0,51,0.08)' : theme === 'light' ? 'rgba(0,102,204,0.06)' : 'rgba(0,212,255,0.08)';

  const icons = [Brain, Cpu, Bot, Sparkles];

  return (
    <section id="ai-intel" className="relative py-16 sm:py-28 px-4 sm:px-6">
      <div
        className="section-backdrop"
        style={{ top: '30%', left: '50%', transform: 'translateX(-50%)' }}
      />

      <div className="max-w-5xl mx-auto relative z-10">
        <AIHeader accent={accent} title={t.aiIntel.title} subtitle={t.aiIntel.subtitle} />

        <div className="mb-6 sm:mb-10">
          <DataCore />
        </div>

        <div className="card-grid grid gap-4 sm:gap-6 md:grid-cols-2">
          {t.aiIntel.cards.map((card, idx) => {
            const Icon = icons[idx % icons.length];
            return (
              <IntelCard
                key={idx}
                idx={idx}
                accent={accent}
                accentGlow={accentGlow}
                header={card.header}
                title={card.title}
                body={card.body}
                Icon={Icon}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
