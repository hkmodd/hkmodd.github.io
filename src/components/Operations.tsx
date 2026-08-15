import { memo } from 'react';
import { motion } from 'motion/react';
import { Star, GitFork, Loader2, Globe, ArrowUpRight } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

import { parseInlineMarkup } from '@/lib/parseInlineMarkup';
import ZineTitle from '@/components/ZineTitle';
import MagneticButton from '@/components/MagneticButton';
import { useHolographicTilt } from '@/hooks/useHolographicTilt';
import { useGitHubRepos, FLAGSHIP_REPO, type GitHubRepo } from '@/hooks/useGitHubRepos';
import { useReveal } from '@/hooks/useReveal';
import Chip3D from '@/components/Chip3D';

/* ── Language → color mapping ─────────────────────────────────── */
const LANG_COLORS: Record<string, string> = {
  Rust: '#dea584',
  Python: '#3572A5',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Go: '#00ADD8',
  C: '#555555',
  'C++': '#f34b7d',
  Java: '#b07219',
};

function langColor(lang: string | null): string {
  if (!lang) return '#666';
  return LANG_COLORS[lang] || '#888';
}

/* ── Single repo card ─────────────────────────────────────────── */
const RepoCard = memo(function RepoCard({
  repo,
  accent,
  idx,
}: {
  repo: GitHubRepo;
  accent: string;
  idx: number;
}) {
  const { ref: tiltRef, onMouseMove, onMouseLeave } = useHolographicTilt<HTMLDivElement>();
  useReveal({ delay: idx * 0.06, duration: 0.5, y: 24 }, tiltRef);

  // Build tags from language + topics (max 3)
  const tags = [repo.language, ...repo.topics.slice(0, 2)]
    .filter(Boolean)
    .join(' / ')
    .toUpperCase();

  const isWebApp = !!repo.homepage;

  return (
    <motion.div
      ref={tiltRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="holo-card group flex flex-col relative"
      style={{ padding: '28px 26px 22px' }}
    >
      {/* Shimmer sweep overlay (z-0) */}
      <div className="card-shimmer z-0" />

      {/* Header row: title + stars */}
      <div className="flex items-start justify-between gap-3 mb-2 relative z-10">
        <div className="flex items-center gap-3">
          {isWebApp && <Globe size={16} className="opacity-70" style={{ color: accent }} />}
          <h3
            className="font-mono text-base font-bold text-text transition-colors leading-snug group-hover:text-white"
            style={{ wordBreak: 'break-word' }}
          >
            {repo.name}
          </h3>
          {repo.fork && (
            <span className="repo-fork-mark">fork</span>
          )}
        </div>

        {repo.stargazers_count > 0 && (
          <span
            className="flex items-center gap-1 shrink-0 font-mono text-[11px]"
            style={{ color: '#ffd700' }}
          >
            <Star size={12} fill="#ffd700" />
            {repo.stargazers_count}
          </span>
        )}
      </div>

      {/* Tags line */}
      {tags && (
        <span
          className="font-mono text-[10px] tracking-widest mb-3 block relative z-10"
          style={{ color: `${accent}99` }}
        >
          {tags}
        </span>
      )}

      {/* Description */}
      <p className="text-text-muted text-[13px] leading-relaxed flex-1 mb-5 relative z-10">
        {repo.description || 'No description available.'}
      </p>

        {/* Bottom row: language dot + link button */}
        <div className="flex flex-col gap-4 mt-auto relative z-30 pointer-events-none">
          <div className="flex items-center justify-between">
            {/* Language indicator */}
            {repo.language && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-dim">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: langColor(repo.language) }}
                />
                {repo.language}
              </span>
            )}
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-border/30 pointer-events-auto">
            {isWebApp ? (
              <>
                <MagneticButton 
                  href={repo.homepage ?? undefined} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  accent={accent} 
                  variant="primary"
                >
                  <Globe size={13} />
                  LIVE SITE
                </MagneticButton>
                <MagneticButton 
                  href={repo.html_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  accent={accent} 
                  variant="secondary"
                >
                  <GitFork size={13} />
                  GITHUB
                </MagneticButton>
              </>
            ) : (
              <MagneticButton 
                href={repo.html_url} 
                target="_blank" 
                rel="noopener noreferrer" 
                accent={accent} 
                variant="secondary"
              >
                <GitFork size={13} />
                GITHUB
              </MagneticButton>
            )}
          </div>
        </div>
    </motion.div>
  );
});

/* ── Loading skeleton ─────────────────────────────────────────── */
function RepoSkeleton({ idx }: { idx: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: idx * 0.05 }}
      className="rounded-2xl border border-border"
      style={{
        background: 'rgba(10, 10, 10, 0.4)',
        padding: '28px 26px 22px',
        minHeight: '180px',
      }}
    >
      <div className="h-4 w-3/4 rounded bg-border mb-3 animate-pulse" />
      <div className="h-3 w-1/3 rounded bg-border mb-4 animate-pulse" />
      <div className="h-3 w-full rounded bg-border mb-2 animate-pulse" />
      <div className="h-3 w-5/6 rounded bg-border mb-2 animate-pulse" />
      <div className="flex-1" />
      <div className="h-3 w-1/4 rounded bg-border mt-4 animate-pulse" />
    </motion.div>
  );
}

function OpsHeader({
  loading,
  count,
  title,
  syncing,
  ready,
}: {
  loading: boolean;
  count: number;
  title: string;
  syncing: string;
  ready: string;
}) {
  const ref = useReveal<HTMLDivElement>({ duration: 0.6, y: 20 });
  return (
    <div ref={ref} className="mb-16 relative z-10 text-center flex flex-col items-center">
      <Chip3D>
        {loading ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            <span>{syncing}</span>
          </>
        ) : (
          <span>{count} {ready}</span>
        )}
      </Chip3D>
      <ZineTitle text={title} />
    </div>
  );
}

function FlagshipCard({
  accent,
  kicker,
  title,
  tags,
  problem,
  outcome,
  cta,
  url,
  stars,
}: {
  accent: string;
  kicker: string;
  title: string;
  tags: string;
  problem: string;
  outcome: string;
  cta: string;
  url: string;
  stars?: number;
}) {
  const { ref: tiltRef, onMouseMove, onMouseLeave } = useHolographicTilt<HTMLDivElement>(8);
  useReveal({ duration: 0.55, y: 28 }, tiltRef);

  return (
    <motion.div
      ref={tiltRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="flagship holo-card relative z-10 mb-10"
    >
      <div className="card-shimmer z-0" />
      <div className="flagship__grid relative z-10">
        <div className="flagship__copy">
          <div className="flex items-center gap-3 mb-4">
            <span className="flagship__kicker" style={{ color: accent }}>{kicker}</span>
            {typeof stars === 'number' && stars > 0 && (
              <span className="flex items-center gap-1 font-mono text-[11px]" style={{ color: '#ffd700' }}>
                <Star size={12} fill="#ffd700" />
                {stars}
              </span>
            )}
          </div>
          <h3 className="flagship__title">{title}</h3>
          <span className="flagship__tags" style={{ color: `${accent}99` }}>{tags}</span>
          <p className="flagship__problem">{parseInlineMarkup(problem, { color: accent })}</p>
          <p className="flagship__outcome">{parseInlineMarkup(outcome, { color: accent })}</p>
          <div className="mt-6">
            <MagneticButton href={url} target="_blank" rel="noopener noreferrer" accent={accent} variant="primary">
              <ArrowUpRight size={13} />
              {cta.toUpperCase()}
            </MagneticButton>
          </div>
        </div>
        <div className="flagship__proto" aria-hidden>
          <div className="flagship__proto-bar">
            <span />
            <span />
            <span />
            <em>context.xml</em>
          </div>
          <pre className="flagship__proto-body">
            <span className="tok-c">{'// CONTEXT SERIALIZER'}</span>
            {'\n'}
            <span className="tok-k">repo</span>
            <span className="tok-p">: </span>
            <span className="tok-s">Projects-TO-LLMs</span>
            {'\n'}
            <span className="tok-k">engine</span>
            <span className="tok-p">: </span>
            <span className="tok-s">rust + tauri</span>
            {'\n'}
            <span className="tok-k">output</span>
            <span className="tok-p">: </span>
            <span className="tok-s">structured XML</span>
            {'\n'}
            <span className="tok-k">egress</span>
            <span className="tok-p">: </span>
            <span className="tok-s">none</span>
            {'\n'}
            <span className="tok-c">{'<repo>'}</span>
            {'\n  '}
            <span className="tok-c">{'<file path="src/lib.rs"/>'}</span>
            {'\n  '}
            <span className="tok-c">{'<file path="src/main.rs"/>'}</span>
            {'\n'}
            <span className="tok-c">{'</repo>'}</span>
          </pre>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main component ───────────────────────────────────────────── */
export default function Operations() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
  const { repos, loading, error } = useGitHubRepos();

  const flagshipRepo = repos.find((r) => r.name === FLAGSHIP_REPO);
  const rest = repos.filter((r) => r.name !== FLAGSHIP_REPO);
  const webApps = rest.filter((r) => !!r.homepage);
  const projects = rest.filter((r) => !r.homepage);

  return (
    <section id="operations" className="py-24 px-6 max-w-6xl mx-auto relative">
      {/* Ambient backdrop */}
      <div
        className="section-backdrop"
        style={{ top: '20%', left: '-10%' }}
      />

      <OpsHeader
        loading={loading}
        count={repos.length}
        title={t.ops.title.toUpperCase()}
        syncing={t.kicker.operationsLoading}
        ready={t.kicker.operationsReady}
      />

      <FlagshipCard
        accent={accent}
        kicker={t.ops.flagship.kicker}
        title={t.ops.flagship.title}
        tags={t.ops.flagship.tags}
        problem={t.ops.flagship.problem}
        outcome={t.ops.flagship.outcome}
        cta={t.ops.flagship.cta}
        url={t.ops.flagship.url}
        stars={flagshipRepo?.stargazers_count}
      />

      {/* Error state */}
      {error && (
        <div
          className="font-mono text-xs text-center py-8 relative z-10"
          style={{ color: '#ff4444' }}
        >
          ⚠ GitHub API: {error}
        </div>
      )}

      {/* Grid: Web Apps */}
      {webApps.length > 0 && (
        <div className="mb-16">
          <h3 className="ops-subhead">
            <Globe size={14} /> {t.ops.liveWebApps}
          </h3>
          <div
            className="card-grid grid relative z-10"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '24px',
            }}
          >
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <RepoSkeleton key={`wa-${i}`} idx={i} />)
              : webApps.map((repo, idx) => (
                  <RepoCard key={repo.name} repo={repo} accent={accent} idx={idx} />
                ))}
          </div>
        </div>
      )}

      {/* Grid: Projects */}
      {projects.length > 0 && (
        <div>
          <h3 className="ops-subhead">
            <GitFork size={14} /> {t.ops.openSource}
          </h3>
          <div
            className="card-grid grid relative z-10"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '24px',
            }}
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <RepoSkeleton key={`pr-${i}`} idx={i} />)
              : projects.map((repo, idx) => (
                  <RepoCard key={repo.name} repo={repo} accent={accent} idx={idx} />
                ))}
          </div>
        </div>
      )}
    </section>
  );
}
