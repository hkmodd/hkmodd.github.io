import { create } from 'zustand';

export type ThemeMode = 'default' | 'redteam' | 'light';
export type Language = 'en' | 'it';

interface AppState {
  // Theme
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleRedTeam: () => void;
  toggleLightMode: () => void;

  // Red team cinematic transition
  redTeamTransitioning: boolean;
  setRedTeamTransitioning: (v: boolean) => void;

  // Language
  language: Language;
  setLanguage: (lang: Language) => void;

  // Boot
  booted: boolean;
  setBooted: (v: boolean) => void;

  // Terminal
  terminalOpen: boolean;
  setTerminalOpen: (v: boolean) => void;
  toggleTerminal: () => void;

  // CTF
  ctfSolved: boolean;
  setCTFSolved: (v: boolean) => void;

  // Screen flash
  showFlash: boolean;
  flashDir: 'enter' | 'exit';  // entering or exiting redteam
  triggerFlash: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Theme - restore from localStorage (SSR-safe)
  theme: ((typeof window !== 'undefined' ? localStorage.getItem('hkmodd-theme') : null) as ThemeMode) || 'default',
  setTheme: (theme) => {
    localStorage.setItem('hkmodd-theme', theme);
    set({ theme });
  },
  toggleRedTeam: () =>
    set((s) => {
      const next = s.theme === 'redteam' ? 'default' : 'redteam';
      const enteringRed = next === 'redteam';
      localStorage.setItem('hkmodd-theme', next);
      // Auto-clear transition flag after cinematic sequence
      if (enteringRed) {
        setTimeout(() => set({ redTeamTransitioning: false }), 2500);
      }
      // Auto-clear flash after animation completes (700ms)
      setTimeout(() => set({ showFlash: false }), 700);
      return {
        theme: next,
        showFlash: true,
        flashDir: enteringRed ? 'enter' : 'exit',
        redTeamTransitioning: enteringRed,
      };
    }),
  toggleLightMode: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'default' : 'light';
      localStorage.setItem('hkmodd-theme', next);
      return { theme: next };
    }),

  // Red team cinematic transition
  redTeamTransitioning: false,
  setRedTeamTransitioning: (redTeamTransitioning) => set({ redTeamTransitioning }),

  // Language - auto-detect or restore
  language: (() => {
    const saved = localStorage.getItem('hkmodd-lang') as Language;
    if (saved) return saved;
    const nav = navigator.language.toLowerCase();
    return nav.startsWith('it') ? 'it' : 'en';
  })(),
  setLanguage: (language) => {
    localStorage.setItem('hkmodd-lang', language);
    set({ language });
  },

  // Boot
  booted: false,
  setBooted: (booted) => set({ booted }),

  // Terminal
  terminalOpen: false,
  setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),

  // CTF
  ctfSolved: localStorage.getItem('hkmodd-ctf') === 'true',
  setCTFSolved: (ctfSolved) => {
    localStorage.setItem('hkmodd-ctf', String(ctfSolved));
    set({ ctfSolved });
  },

  // Screen flash
  showFlash: false,
  flashDir: 'enter' as const,
  triggerFlash: () => {
    set({ showFlash: true, flashDir: 'enter' });
    setTimeout(() => set({ showFlash: false }), 700);
  },
}));
