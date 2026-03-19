import { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { TerminalEngine, type TerminalLine } from '@/lib/terminal';

export default function Terminal() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const ctfSolved = useAppStore((s) => s.ctfSolved);
  const setCTFSolved = useAppStore((s) => s.setCTFSolved);

  const accent = theme === 'redteam' ? '#ff0033' : '#00d4ff';

  const engineRef = useRef<TerminalEngine | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    engineRef.current = new TerminalEngine(t.terminal.greeting, ctfSolved);
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

  const lineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'input': return accent;
      case 'error': return '#ff4444';
      case 'success': return '#00ff88';
      case 'system': return 'rgba(255,255,255,0.35)';
      default: return '#d0d0d0';
    }
  };

  return (
    <section id="terminal" className="py-24 px-6 max-w-6xl mx-auto relative">
      {/* Ambient backdrop */}
      <div
        className="section-backdrop"
        style={{ bottom: '-10%', left: '50%', transform: 'translateX(-50%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-8 relative z-10"
      >
        <h2
          className="text-3xl md:text-4xl font-black font-mono tracking-tight"
          style={{ color: accent }}
        >
          {`// ${t.terminal.title}`}
        </h2>
        <p className="text-text-muted text-sm mt-3 max-w-lg">
          {t.terminal.subtitle}
        </p>
      </motion.div>

      {/* Terminal frame with breathing border */}
      <motion.div
        initial={{ opacity: 0, y: 35 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="terminal-frame relative z-10"
        onClick={() => inputRef.current?.focus()}
      >
        {/* macOS-style title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '18px',
            paddingBottom: '12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27ca40' }} />
          <span
            className="font-mono"
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-dim)',
              marginLeft: '10px',
              letterSpacing: '0.05em',
            }}
          >
            darkcore@terminal
          </span>
        </div>

        {/* Output area */}
        <div
          ref={scrollRef}
          className="font-mono terminal-scroll"
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
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

        {/* Input line */}
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
              color: 'var(--color-text)',
              fontFamily: "var(--font-m, 'JetBrains Mono', monospace)",
              fontSize: '0.9rem',
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="terminal-cursor font-mono" style={{ color: accent }}>▊</span>
        </form>
      </motion.div>
    </section>
  );
}
