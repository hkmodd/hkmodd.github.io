import { useState, type ComponentType } from 'react';
import { motion } from 'motion/react';
import { Mail, Heart, Send } from 'lucide-react';
import { GithubIcon, LinkedinIcon } from '@/components/BrandIcons';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n';
import { useReveal } from '@/hooks/useReveal';
import { mailtoHref } from '@/lib/contact';

const socials = [
  { icon: GithubIcon, href: 'https://github.com/hkmodd', label: 'GitHub' },
  { icon: LinkedinIcon, href: 'https://www.linkedin.com/in/gelmetti-sebastiano/', label: 'LinkedIn' },
  { icon: Mail, href: '#', label: 'Email' },
];

function FooterCta({
  language,
  emailHref,
  onReveal,
}: {
  language: string;
  emailHref: string;
  onReveal: () => string;
}) {
  const ref = useReveal<HTMLDivElement>({ duration: 0.5, y: 20 });
  return (
    <div ref={ref} className="text-center mb-10">
      <p className="chip-3d" style={{ marginBottom: '1rem' }}>
        {language === 'it' ? 'Interessato? Parliamone.' : 'Interested? Let\'s talk.'}
      </p>
      <motion.a
        href={emailHref}
        onMouseEnter={onReveal}
        onFocus={onReveal}
        onClick={(e) => {
          if (emailHref === '#') {
            e.preventDefault();
            window.location.href = onReveal();
          }
        }}
        className="btn-cyber btn-cyber--primary"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
      >
        <Send size={14} />
        {language === 'it' ? 'CONTATTAMI' : 'CONTACT ME'}
      </motion.a>
    </div>
  );
}

function SocialLink({
  href,
  label,
  idx,
  accent,
  Icon,
  onReveal,
}: {
  href: string;
  label: string;
  idx: number;
  accent: string;
  Icon: ComponentType<{ size?: number }>;
  onReveal?: () => string;
}) {
  const ref = useReveal<HTMLAnchorElement>({ delay: idx * 0.1, duration: 0.5, y: 8 });
  const isEmail = label === 'Email';
  return (
    <motion.a
      ref={ref}
      href={href}
      onMouseEnter={onReveal}
      onFocus={onReveal}
      onClick={(e) => {
        if (isEmail && href === '#') {
          e.preventDefault();
          const next = onReveal?.();
          if (next) window.location.href = next;
        }
      }}
      target={isEmail ? undefined : '_blank'}
      rel={isEmail ? undefined : 'noopener noreferrer'}
      className="p-2.5 rounded-lg transition-all duration-300 cursor-pointer"
      style={{
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-muted)',
      }}
      whileHover={{
        borderColor: `${accent}40`,
        color: accent,
        scale: 1.15,
        boxShadow: `0 0 20px ${accent}15`,
      }}
      title={label}
    >
      <Icon size={16} />
    </motion.a>
  );
}

export default function Footer() {
  const { t, language } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const ctfSolved = useAppStore((s) => s.ctfSolved);
  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';

  const [emailHref, setEmailHref] = useState('#');
  const handleEmailReveal = () => {
    const href = mailtoHref();
    setEmailHref(href);
    return href;
  };

  return (
    <footer className="relative z-10">
      <div className="footer-border-top" />

      <div className="max-w-6xl mx-auto px-6 py-12">
        <FooterCta language={language} emailHref={emailHref} onReveal={handleEmailReveal} />

        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <p
              className="font-mono text-sm font-bold tracking-tight mb-1"
              style={{ color: accent }}
            >
              Sebastiano Gelmetti
            </p>
            <p className="text-text-dim text-xs font-mono">
              {t.hero.title}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {socials.map(({ icon: Icon, href, label }, idx) => {
              const isEmail = label === 'Email';
              return (
                <SocialLink
                  key={label}
                  href={isEmail ? emailHref : href}
                  label={label}
                  idx={idx}
                  accent={accent}
                  Icon={Icon}
                  onReveal={isEmail ? handleEmailReveal : undefined}
                />
              );
            })}
          </div>

          <div className="text-center md:text-right">
            {ctfSolved ? (
              <div className="font-mono text-[10px] tracking-widest" style={{ color: '#00ff88' }}>
                ✓ CTF COMPLETED
              </div>
            ) : (
              <p className="text-text-dim text-[10px] font-mono tracking-wider">
                © {new Date().getFullYear()} HKModd
              </p>
            )}
            <p className="text-text-dim text-[10px] font-mono mt-1 flex items-center justify-center md:justify-end gap-1">
              Built with <Heart size={10} style={{ color: accent }} /> and code
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
