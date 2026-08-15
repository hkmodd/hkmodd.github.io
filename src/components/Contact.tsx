import { useState } from 'react';
import { Mail, MapPin, Send } from 'lucide-react';
import { GithubIcon, LinkedinIcon } from '@/components/BrandIcons';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { useReveal } from '@/hooks/useReveal';
import { mailtoHref } from '@/lib/contact';
import { haptic } from '@/lib/haptic';
import Chip3D from '@/components/Chip3D';
import ZineTitle from '@/components/ZineTitle';

export default function Contact() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const [emailHref, setEmailHref] = useState('#');
  const headerRef = useReveal<HTMLDivElement>({ duration: 0.55, y: 20 });
  const bodyRef = useReveal<HTMLDivElement>({ delay: 0.08, duration: 0.5, y: 16 });

  const reveal = () => {
    const href = mailtoHref();
    setEmailHref(href);
    return href;
  };

  return (
    <section id="contact" className="contact-section py-24 px-6 max-w-4xl mx-auto relative">
      <div className="section-backdrop" style={{ top: '10%', left: '50%', transform: 'translateX(-50%)' }} />

      <div ref={headerRef} className="mb-10 relative z-10 text-center flex flex-col items-center">
        <Chip3D>{t.kicker.contact}</Chip3D>
        <ZineTitle text={t.contact.title.toUpperCase()} />
      </div>

      <div ref={bodyRef} className="contact-panel relative z-10">
        <p className="contact-body">{t.contact.body}</p>
        <div className="contact-loc">
          <MapPin size={13} style={{ color: accent }} />
          <span>{t.contact.location}</span>
        </div>
        <div className="contact-actions">
          <a
            href={emailHref}
            className="btn-cyber btn-cyber--primary"
            onMouseEnter={reveal}
            onFocus={reveal}
            onClick={(e) => {
              haptic('medium');
              if (emailHref === '#') {
                e.preventDefault();
                window.location.href = reveal();
              }
            }}
          >
            <Send size={15} />
            <span>{t.contact.cta}</span>
          </a>
          <a
            href="https://github.com/hkmodd"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-cyber"
            onClick={() => haptic('light')}
          >
            <GithubIcon size={15} />
            <span>GitHub</span>
          </a>
          <a
            href="https://www.linkedin.com/in/gelmetti-sebastiano/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-cyber"
            onClick={() => haptic('light')}
          >
            <LinkedinIcon size={15} />
            <span>LinkedIn</span>
          </a>
        </div>
        <p className="contact-hint">
          <Mail size={11} />
          <span>{t.contact.cta} → {t.contact.location}</span>
        </p>
      </div>
    </section>
  );
}
