import { useState, useEffect } from 'react';

export interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  topics: string[];
  fork: boolean;
  archived: boolean;
  updated_at: string;
}

interface UseGitHubReposResult {
  repos: GitHubRepo[];
  loading: boolean;
  error: string | null;
}

const CACHE_KEY = 'hkmodd_github_repos';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetches public repos from GitHub API for user "hkmodd".
 * - Filters out forks, archived, and the portfolio repo itself
 * - Sorts by most recently updated
 * - Caches in sessionStorage to avoid rate limits
 */
export function useGitHubRepos(): UseGitHubReposResult {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRepos() {
      // Check cache first
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            if (!cancelled) {
              setRepos(data);
              setLoading(false);
            }
            return;
          }
        }
      } catch {
        // Cache miss or corrupt — continue to fetch
      }

      try {
        const res = await fetch(
          'https://api.github.com/users/hkmodd/repos?sort=updated&per_page=100&type=owner',
          {
            headers: { Accept: 'application/vnd.github.v3+json' },
          }
        );

        if (!res.ok) {
          throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
        }

        const raw: GitHubRepo[] = await res.json();

        // Filter: no forks, no archived, no portfolio repo
        const filtered = raw
          .filter((r) => !r.fork && !r.archived)
          .filter((r) => {
            const name = r.name.toLowerCase();
            return name !== 'hkmodd.github.io' && name !== 'hkmodd';
          })
          .sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );

        // Cache it
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ data: filtered, timestamp: Date.now() })
          );
        } catch {
          // sessionStorage might be full — no big deal
        }

        if (!cancelled) {
          setRepos(filtered);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch repos');
          setLoading(false);
        }
      }
    }

    fetchRepos();
    return () => {
      cancelled = true;
    };
  }, []);

  return { repos, loading, error };
}
