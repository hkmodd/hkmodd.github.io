import { motion } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { useHolographicTilt } from '@/hooks/useHolographicTilt';
import { parseInlineMarkup } from '@/lib/parseInlineMarkup';

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
  const isOrange = fullWidth;
  const borderColor = isOrange ? 'rgba(255, 77, 0, 0.12)' : 'rgba(0, 243, 255, 0.08)';
  const bgColor = isOrange ? 'rgba(20, 10, 0, 0.4)' : 'rgba(0, 20, 20, 0.6)';
  const strongColor = isOrange ? '#ff4d00' : accent;

  return (
    <motion.div
      ref={tiltRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: idx * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="dossier-card"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        padding: '28px',
        borderRadius: '8px',
        gridColumn: fullWidth ? '1 / -1' : undefined,
        transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      whileHover={{
        borderColor: isOrange ? '#ff4d00' : accent,
        boxShadow: isOrange
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
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
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
            color: 'rgba(255,255,255,0.08)',
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

export default function Identity() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : '#00d4ff';

  return (
    <section id="identity" className="py-24 px-6 max-w-6xl mx-auto relative">
      {/* Ambient backdrop */}
      <div
        className="section-backdrop"
        style={{ bottom: '0', right: '-20%' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12 relative z-10"
      >
        <h2
          className="text-3xl md:text-4xl font-black font-mono tracking-tight"
          style={{ color: accent }}
        >
          {'// '}{t.identity.title.toUpperCase()}
        </h2>
        <div className="h-[1px] mt-3 w-16" style={{ background: accent, opacity: 0.4 }} />
      </motion.div>

      {/* Dossier grid - 2-col auto-fit, last card full-width */}
      <div
        className="relative z-10"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '25px',
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
