import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { CERT_MODULES, CERT_MODULE_SIZE, DIPLOMA } from '@/data/certs';
import { useReveal } from '@/hooks/useReveal';
import { useHolographicTilt } from '@/hooks/useHolographicTilt';

import { haptic } from '@/lib/haptic';
import Chip3D from '@/components/Chip3D';
import ZineTitle from '@/components/ZineTitle';

interface Viewer {
  src: string;
  title: string;
  meta: string;
  pdf?: string;
}

function DiplomaFrame({
  accent,
  title,
  meta,
  cta,
  onOpen,
}: {
  accent: string;
  title: string;
  meta: string;
  cta: string;
  onOpen: () => void;
}) {
  const { ref: tiltRef, onMouseMove, onMouseLeave } = useHolographicTilt<HTMLDivElement>(7);
  useReveal({ duration: 0.55, y: 24 }, tiltRef);

  return (
    <div
      ref={tiltRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}

      className="cert-diploma"
    >
      <button type="button" className="cert-diploma__frame" onClick={onOpen}>
        <img
          src={DIPLOMA.image}
          alt={title}
          width={DIPLOMA.width}
          height={DIPLOMA.height}
          loading="lazy"
          decoding="async"
        />
      </button>
      <div className="cert-diploma__meta">
        <h3>{title}</h3>
        <p>{meta}</p>
        <a
          href={DIPLOMA.pdf}
          download="Gelmetti-Sebastiano-Epicode-CS0724IT.pdf"
          className="btn-cyber"
          style={{ borderColor: accent, color: accent }}
          onClick={() => haptic('medium')}
        >
          <Download size={14} />
          <span>{cta}</span>
        </a>
      </div>
    </div>
  );
}

function ModuleTile({
  image,
  code,
  title,
  date,
  idx,
  onOpen,
}: {
  image: string;
  code: string;
  title: string;
  date: string;
  idx: number;
  onOpen: () => void;
}) {
  const ref = useReveal<HTMLButtonElement>({ delay: idx * 0.04, duration: 0.45, y: 16 });
  return (
    <button
      type="button"
      ref={ref}
      className="cert-tile"

      onClick={onOpen}
    >
      <img
        src={image}
        alt={`${code} — ${title}`}
        width={CERT_MODULE_SIZE.width}
        height={CERT_MODULE_SIZE.height}
        loading="lazy"
        decoding="async"
      />
      <span className="cert-tile__code">{code}</span>
      <span className="cert-tile__caption">
        <strong>{title}</strong>
        <em>{date}</em>
      </span>
    </button>
  );
}

function Lightbox({
  viewer,
  closeLabel,
  onClose,
}: {
  viewer: Viewer;
  closeLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="cert-lightbox" role="dialog" aria-modal="true" aria-label={viewer.title}>
      <button type="button" className="cert-lightbox__backdrop" aria-label={closeLabel} onClick={onClose} />
      <div className="cert-lightbox__panel">
        <div className="cert-lightbox__toolbar">
          <div>
            <p className="cert-lightbox__title">{viewer.title}</p>
            <p className="cert-lightbox__meta">{viewer.meta}</p>
          </div>
          <div className="cert-lightbox__actions">
            {viewer.pdf && (
              <a href={viewer.pdf} download="Gelmetti-Sebastiano-Epicode-CS0724IT.pdf" className="btn-cyber">
                <Download size={14} />
                <span>PDF</span>
              </a>
            )}
            <button type="button" className="cert-lightbox__x" onClick={onClose} aria-label={closeLabel}>
              <X size={16} />
            </button>
          </div>
        </div>
        <img src={viewer.src} alt={viewer.title} />
      </div>
    </div>,
    document.body,
  );
}

export default function CertVault() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const headerRef = useReveal<HTMLDivElement>({ duration: 0.55, y: 20 });

  const openDiploma = useCallback(() => {
    haptic('light');
    setViewer({
      src: DIPLOMA.image,
      title: t.identity.certs.diplomaTitle,
      meta: t.identity.certs.diplomaMeta,
      pdf: DIPLOMA.pdf,
    });
  }, [t.identity.certs.diplomaMeta, t.identity.certs.diplomaTitle]);

  return (
    <section id="certs" className="cert-vault py-24 px-6 max-w-6xl mx-auto relative">
      <div ref={headerRef} className="mb-12 text-center flex flex-col items-center">
        <Chip3D>{t.kicker.certs}</Chip3D>
        <ZineTitle text={t.identity.certs.title.toUpperCase()} />
      </div>

      <DiplomaFrame
        accent={accent}
        title={t.identity.certs.diplomaTitle}
        meta={t.identity.certs.diplomaMeta}
        cta={t.identity.certs.diplomaCta}
        onOpen={openDiploma}
      />

      <div className="cert-grid">
        {t.identity.certs.modules.map((mod, idx) => {
          const asset = CERT_MODULES.find((m) => m.code === mod.code);
          if (!asset) return null;
          return (
            <ModuleTile
              key={mod.code}
              image={asset.image}
              code={mod.code}
              title={mod.title}
              date={mod.date}
              idx={idx}
              onOpen={() => {
                haptic('light');
                setViewer({
                  src: asset.image,
                  title: `${mod.code} · ${mod.title}`,
                  meta: mod.date,
                });
              }}
            />
          );
        })}
      </div>

      {viewer && (
        <Lightbox
          viewer={viewer}
          closeLabel={t.identity.certs.close}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}
