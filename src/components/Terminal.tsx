import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useReveal } from '@/hooks/useReveal';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { TerminalEngine, type TerminalLine } from '@/lib/terminal';
import ZineTitle from '@/components/ZineTitle';
import Chip3D from '@/components/Chip3D';

function TermHeader({ title, subtitle, kicker }: { title: string; subtitle: string; kicker: string }) {
  const ref = useReveal<HTMLDivElement>({ duration: 0.6, y: 20 });
  return (
    <div ref={ref} className="mb-12 relative z-10 text-center flex flex-col items-center">
      <Chip3D>{kicker}</Chip3D>
      <ZineTitle text={title} />
      <p className="text-text-muted text-sm mt-6 max-w-lg">
        {subtitle}
      </p>
    </div>
  );
}

function TermFrame({ children, onFocusInput }: { children: ReactNode; onFocusInput: () => void }) {
  return (
    <div className="terminal-frame relative z-10" onClick={onFocusInput}>
      {children}
    </div>
  );
}

export default function Terminal() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const ctfSolved = useAppStore((s) => s.ctfSolved);
  const setCTFSolved = useAppStore((s) => s.setCTFSolved);

  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';

  const engineRef = useRef<TerminalEngine | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    engineRef.current = new TerminalEngine(t.terminal.greeting, ctfSolved, {
      toggleHud: () => useAppStore.getState().toggleHud(),
    });
    setLines(engineRef.current.getHistory());
  }, [t.terminal.greeting, ctfSolved]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!engineRef.current) return;
      const newLines = engineRef.current.execute(input);
      setLines([...newLines]);
      setInput('');
      setHistoryIdx(-1);
      if (engineRef.current.isCTFSolved() && !ctfSolved) {
        setCTFSolved(true);
      }
    },
    [input, ctfSolved, setCTFSolved]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!engineRef.current) return;
      const cmdHist = engineRef.current.getCommandHistory();
      if (!cmdHist.length) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIdx = historyIdx === -1 ? cmdHist.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(newIdx);
        setInput(cmdHist[newIdx]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIdx === -1) return;
        const newIdx = historyIdx + 1;
        if (newIdx >= cmdHist.length) {
          setHistoryIdx(-1);
          setInput('');
        } else {
          setHistoryIdx(newIdx);
          setInput(cmdHist[newIdx]);
        }
      }
    },
    [historyIdx]
  );

  const isLight = theme === 'light';

  const lineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'input': return accent;
      case 'error': return '#ff4444';
      case 'success': return isLight ? '#16a34a' : '#00ff88';
      case 'system': return isLight ? '#c0c8d4' : 'rgba(255,255,255,0.35)';
      default: return isLight ? '#e2e6ea' : '#d0d0d0';
    }
  };

  return (
    <section id="terminal" className="py-24 px-6 max-w-6xl mx-auto relative">
      <div
        className="section-backdrop"
        style={{ bottom: '-10%', left: '50%', transform: 'translateX(-50%)' }}
      />

      <TermHeader title={t.terminal.title.toUpperCase()} subtitle={t.terminal.subtitle} kicker={t.kicker.terminal} />

      <TermFrame onFocusInput={() => inputRef.current?.focus()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '18px',
            paddingBottom: '12px',
            borderBottom: `1px solid ${isLight ? 'rgba(255,255,255,0.12)' : 'rgba(255, 255, 255, 0.06)'}`,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27ca40' }} />
          <span
            className="font-mono"
            style={{
              fontSize: '0.75rem',
              color: isLight ? '#7c8594' : 'var(--color-text-dim)',
              marginLeft: '10px',
              letterSpacing: '0.05em',
            }}
          >
            darkcore@terminal
          </span>
        </div>

        <div
          ref={scrollRef}
          className="font-mono terminal-scroll"
          style={{
            fontSize: '0.85rem',
            color: isLight ? '#b0b8c4' : 'var(--color-text-muted)',
            minHeight: '50px',
            maxHeight: '300px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            marginBottom: '12px',
          }}
        >
          {lines.map((line) => (
            <div key={line.id} style={{ color: lineColor(line.type) }}>
              {line.text || '\u00A0'}
            </div>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span className="font-mono" style={{ color: accent, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
            {t.terminal.prompt}:~$
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="terminal-input"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: isLight ? '#e8ecf0' : 'var(--color-text)',
              fontFamily: "var(--font-m, 'JetBrains Mono', monospace)",
              fontSize: '0.9rem',
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="terminal-cursor font-mono" style={{ color: accent }}>▊</span>
        </form>
      </TermFrame>
    </section>
  );
}
