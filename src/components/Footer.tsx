import { motion } from 'motion/react';
import { Github, Linkedin, Mail, Heart, Send } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n';

const socials = [
  { icon: Github, href: 'https://github.com/hkmodd', label: 'GitHub' },
  { icon: Linkedin, href: 'https://www.linkedin.com/in/gelmetti-sebastiano/', label: 'LinkedIn' },
  { icon: Mail, href: 'mailto:sebastiano.gelmetti@gmail.com', label: 'Email' },
];

export default function Footer() {
  const { t, language } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const ctfSolved = useAppStore((s) => s.ctfSolved);
  const accent = theme === 'redteam' ? '#ff0033' : '#00d4ff';

  return (
    <footer className="relative z-10">
      {/* Gradient border-top */}
      <div className="footer-border-top" />

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Contact CTA for recruiters */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p className="font-mono text-xs tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
            {language === 'it' ? 'INTERESSATO? PARLIAMONE.' : 'INTERESTED? LET\'S TALK.'}
          </p>
          <motion.a
            href="mailto:sebastiano.gelmetti@gmail.com"
            className="inline-flex items-center gap-2 px-6 py-3 font-mono text-sm font-bold tracking-wider rounded-lg transition-all duration-300"
            style={{
              border: `1px solid ${accent}60`,
              color: accent,
              background: `${accent}08`,
            }}
            whileHover={{
              scale: 1.05,
              borderColor: accent,
              background: `${accent}15`,
              boxShadow: `0 0 30px ${accent}20`,
            }}
            whileTap={{ scale: 0.97 }}
          >
            <Send size={14} />
            {language === 'it' ? 'CONTATTAMI' : 'CONTACT ME'}
          </motion.a>
        </motion.div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Left: branding */}
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

          {/* Center: social icons with glow hover */}
          <div className="flex items-center gap-3">
            {socials.map(({ icon: Icon, href, label }, idx) => (
              <motion.a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="p-2.5 rounded-lg transition-all duration-300"
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
            ))}
          </div>

          {/* Right: CTF badge or copyright */}
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
