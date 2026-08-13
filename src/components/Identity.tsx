import { motion } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { useHolographicTilt } from '@/hooks/useHolographicTilt';
import { parseInlineMarkup } from '@/lib/parseInlineMarkup';
import { playHoverTick } from '@/lib/audio';
import ScrambledTitle from '@/components/ScrambledTitle';
import { useReveal } from '@/hooks/useReveal';
import Chip3D from '@/components/Chip3D';

function IdentityCard({
  header,
  title,
  body,
  accent,
  idx,
  fullWidth,
}: {
  header: string;
  title: string;
  body: string;
  accent: string;
  idx: number;
  fullWidth?: boolean;
}) {
  const { ref: tiltRef, onMouseMove, onMouseLeave } = useHolographicTilt();
  useReveal({ delay: idx * 0.1, duration: 0.5, y: 20 }, tiltRef);
  const theme = useAppStore((s) => s.theme);
  const isLight = theme === 'light';
  const isOrange = fullWidth;

  // Theme-aware colors — inline styles have highest specificity so they must adapt
  const borderColor = isLight
    ? 'rgba(0, 0, 0, 0.08)'
    : isOrange ? 'rgba(255, 77, 0, 0.12)' : 'rgba(0, 243, 255, 0.08)';
  const bgColor = isLight
    ? 'rgba(255, 255, 255, 0.9)'
    : isOrange ? 'rgba(20, 10, 0, 0.4)' : 'rgba(0, 20, 20, 0.6)';
  const separatorColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)';
  const diamondColor = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
  const strongColor = isOrange && !isLight ? '#ff4d00' : accent;

  return (
    <motion.div
      ref={tiltRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseEnter={playHoverTick}
      className="dossier-card"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        padding: '36px',
        borderRadius: '8px',
        gridColumn: fullWidth ? '1 / -1' : undefined,
      }}
      whileHover={{
        borderColor: isOrange && !isLight ? '#ff4d00' : accent,
        boxShadow: isLight
          ? `0 4px 20px rgba(0,102,204,0.08), 0 8px 32px rgba(0,0,0,0.06)`
          : isOrange
            ? '0 0 30px rgba(255, 77, 0, 0.08)'
            : `0 0 30px ${accent}10`,
      }}
    >
      {/* Dossier header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          borderBottom: `1px solid ${separatorColor}`,
          paddingBottom: '10px',
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: '0.7rem',
            color: 'var(--color-text-dim)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          {header}
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: '0.6rem',
            color: diamondColor,
            letterSpacing: '3px',
          }}
        >
          ◆
        </span>
      </div>

      {/* Title */}
      <h3
        style={{
          fontFamily: "var(--font-d, 'Orbitron', sans-serif)",
          fontSize: '1.15rem',
          marginBottom: '14px',
          color: 'var(--color-text)',
          fontWeight: 700,
        }}
      >
        {title}
      </h3>

      {/* Body with safe inline markup */}
      <div
        className="leading-relaxed"
        style={{
          color: 'var(--color-text-muted)',
          fontSize: '0.92rem',
          lineHeight: '1.7',
        }}
      >
        {parseInlineMarkup(body, { color: strongColor })}
      </div>
    </motion.div>
  );
}

function IdentityHeader({ accent, title }: { accent: string; title: string }) {
  const ref = useReveal<HTMLDivElement>({ duration: 0.6, y: 20 });
  return (
    <div ref={ref} className="mb-24 relative z-10 text-center flex flex-col items-center">
      <Chip3D>
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
        <span className="text-xs font-mono tracking-widest text-text-dim uppercase">Personnel File</span>
      </Chip3D>
      <h2
        className="text-4xl md:text-6xl font-black font-mono tracking-tighter"
        style={{ color: 'var(--color-text)' }}
      >
        <ScrambledTitle text={title} />
      </h2>
      <div className="h-[2px] mt-8 w-24 mx-auto" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
    </div>
  );
}

export default function Identity() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';

  return (
    <section id="identity" className="py-24 px-6 max-w-6xl mx-auto relative">
      {/* Ambient backdrop */}
      <div
        className="section-backdrop"
        style={{ bottom: '0', right: '-20%' }}
      />

      <IdentityHeader accent={accent} title={t.identity.title.toUpperCase()} />

      {/* Dossier grid - 2-col auto-fit, last card full-width */}
      <div
        className="card-grid relative z-10"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '32px',
          margin: '16px 12px 0 12px',
          padding: '4px',
        }}
      >
        {t.identity.cards.map((card, idx) => (
          <IdentityCard
            key={idx}
            header={card.header}
            title={card.title}
            body={card.body}
            accent={accent}
            idx={idx}
            fullWidth={idx === t.identity.cards.length - 1}
          />
        ))}
      </div>
    </section>
  );
}
