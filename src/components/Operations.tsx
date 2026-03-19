import { memo } from 'react';
import { motion } from 'motion/react';
import { ExternalLink, Star, GitFork, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { useHolographicTilt } from '@/hooks/useHolographicTilt';
import { useGitHubRepos, type GitHubRepo } from '@/hooks/useGitHubRepos';

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
  const { ref: tiltRef, onMouseMove, onMouseLeave } = useHolographicTilt<HTMLAnchorElement>();

  // Build tags from language + topics (max 3)
  const tags = [repo.language, ...repo.topics.slice(0, 2)]
    .filter(Boolean)
    .join(' / ')
    .toUpperCase();

  return (
    <motion.a
      ref={tiltRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      href={repo.homepage || repo.html_url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: idx * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="holo-card group flex flex-col cursor-pointer"
      style={{ padding: '28px 26px 22px' }}
    >
      {/* Shimmer sweep overlay */}
      <div className="card-shimmer" />

      {/* Header row: title + stars */}
      <div className="flex items-start justify-between gap-3 mb-2 relative z-10">
        <h3
          className="font-mono text-base font-bold text-text group-hover:text-white transition-colors leading-snug"
          style={{ wordBreak: 'break-word' }}
        >
          {repo.name}
        </h3>

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
      <div className="flex items-center justify-between relative z-10">
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

        {/* CTA Button */}
        <span
          className="repo-link-btn font-mono text-[10px] tracking-widest uppercase flex items-center gap-1.5 px-3 py-1.5 rounded transition-all duration-300 group-hover:gap-2.5"
          style={{
            color: accent,
            border: `1px solid ${accent}30`,
            background: `${accent}08`,
          }}
        >
          <ExternalLink size={11} />
          VIEW
        </span>
      </div>
    </motion.a>
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

/* ── Main component ───────────────────────────────────────────── */
export default function Operations() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const accent = theme === 'redteam' ? '#ff0033' : '#00d4ff';
  const { repos, loading, error } = useGitHubRepos();

  return (
    <section id="operations" className="py-24 px-6 max-w-6xl mx-auto relative">
      {/* Ambient backdrop */}
      <div
        className="section-backdrop"
        style={{ top: '20%', left: '-10%' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12 relative z-10"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2
              className="text-3xl md:text-4xl font-black font-mono tracking-tight"
              style={{ color: accent }}
            >
              {'// '}{t.ops.title.toUpperCase()}
            </h2>
            <div className="h-[1px] mt-3 w-16" style={{ background: accent, opacity: 0.4 }} />
          </div>

          {/* Live indicator */}
          <span
            className="font-mono text-[10px] tracking-widest flex items-center gap-2"
            style={{ color: 'var(--color-text-dim)' }}
          >
            {loading ? (
              <>
                <Loader2 size={12} className="animate-spin" style={{ color: accent }} />
                SYNCING GITHUB…
              </>
            ) : (
              <>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: '#00ff88',
                    boxShadow: '0 0 8px rgba(0, 255, 136, 0.4)',
                    animation: 'status-pulse 2s ease-in-out infinite',
                  }}
                />
                {repos.length} REPOS LIVE
              </>
            )}
          </span>
        </div>
      </motion.div>

      {/* Error state */}
      {error && (
        <div
          className="font-mono text-xs text-center py-8 relative z-10"
          style={{ color: '#ff4444' }}
        >
          ⚠ GitHub API: {error}
        </div>
      )}

      {/* Repo grid */}
      <div
        className="grid relative z-10"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '24px',
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <RepoSkeleton key={i} idx={i} />)
          : repos.map((repo, idx) => (
              <RepoCard key={repo.name} repo={repo} accent={accent} idx={idx} />
            ))}
      </div>
    </section>
  );
}
