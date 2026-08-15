import { type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useHolographicTilt } from '@/hooks/useHolographicTilt';
import { parseInlineMarkup } from '@/lib/parseInlineMarkup';

import ZineTitle from '@/components/ZineTitle';
import { useReveal } from '@/hooks/useReveal';
import Chip3D from '@/components/Chip3D';

const CARD_INK = ['#00e5ff', '#ff2a6d', '#ffe600'];

function IdentityCard({
  header,
  title,
  body,
  idx,
  fullWidth,
}: {
  header: string;
  title: string;
  body: string;
  idx: number;
  fullWidth?: boolean;
}) {
  const { ref: tiltRef, onMouseMove, onMouseLeave } = useHolographicTilt();
  useReveal({ delay: idx * 0.1, duration: 0.5, y: 20 }, tiltRef);

  return (
    <motion.div
      ref={tiltRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}

      className="dossier-card"
      style={{
        gridColumn: fullWidth ? '1 / -1' : undefined,
        '--ink': CARD_INK[idx % CARD_INK.length],
      } as CSSProperties}
    >
      <span className="dossier-card__kicker">{header}</span>
      <h3 className="dossier-card__title">{title}</h3>
      <div className="dossier-card__body">
        {parseInlineMarkup(body, { color: CARD_INK[idx % CARD_INK.length] })}
      </div>
    </motion.div>
  );
}

function IdentityHeader({ title, kicker }: { title: string; kicker: string }) {
  const ref = useReveal<HTMLDivElement>({ duration: 0.6, y: 20 });
  return (
    <div ref={ref} className="mb-16 relative z-10 text-center flex flex-col items-center">
      <Chip3D>{kicker}</Chip3D>
      <ZineTitle text={title} />
    </div>
  );
}

export default function Identity() {
  const { t } = useTranslation();

  return (
    <section id="identity" className="py-24 px-6 max-w-6xl mx-auto relative">
      {/* Ambient backdrop */}
      <div
        className="section-backdrop"
        style={{ bottom: '0', right: '-20%' }}
      />

      <IdentityHeader title={t.identity.title.toUpperCase()} kicker={t.kicker.identity} />

      {/* Dossier grid - 2-col auto-fit, last card full-width */}
      <div
        className="card-grid relative z-10"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '32px',
          margin: '8px 4px 0 4px',
          padding: '18px 10px',
        }}
      >
        {t.identity.cards.map((card, idx) => (
          <IdentityCard
            key={idx}
            header={card.header}
            title={card.title}
            body={card.body}
            idx={idx}
            fullWidth={idx === t.identity.cards.length - 1}
          />
        ))}
      </div>
    </section>
  );
}
