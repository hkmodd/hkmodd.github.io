import { create } from 'zustand';
import { playGlitchDistortion } from '@/lib/audio';
import { applyThemeToDom, withThemeTransition } from '@/lib/themeDom';

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
  // Canvas Performance Optimization
  canvasVisible: boolean;
  setCanvasVisible: (v: boolean) => void;

  // Telemetry HUD (` key or `hud` terminal command)
  hudOpen: boolean;
  toggleHud: () => void;

  // Engine warm-up: true once the neural engine has produced real frames.
  // BootScreen holds the reveal until this flips (with a grace timeout).
  engineReady: boolean;
  setEngineReady: (v: boolean) => void;

  // A11y
  reducedMotion: boolean;
  reducedData: boolean;
}

const getInitialReducedMotion = () => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
};

const getInitialReducedData = () => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-reduced-data: reduce)').matches;
  }
  return false;
};

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'default';
  const saved = localStorage.getItem('hkmodd-theme') as ThemeMode;
  if (saved) return saved;
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'default';
};

export const useAppStore = create<AppState>((set) => ({
  // Theme - auto-detect or restore (SSR-safe)
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem('hkmodd-theme', theme);
    applyThemeToDom(theme);
    set({ theme });
  },
  toggleRedTeam: () => {
    const next = useAppStore.getState().theme === 'redteam' ? 'default' : 'redteam';
    const enteringRed = next === 'redteam';
    localStorage.setItem('hkmodd-theme', next);
    withThemeTransition(() => {
      applyThemeToDom(next);
      set({
        theme: next,
        showFlash: true,
        flashDir: enteringRed ? 'enter' : 'exit',
        redTeamTransitioning: enteringRed,
      });
    });
    if (enteringRed) {
      playGlitchDistortion();
      setTimeout(() => set({ redTeamTransitioning: false }), 2500);
    }
    setTimeout(() => set({ showFlash: false }), 700);
  },
  toggleLightMode: () => {
    const next = useAppStore.getState().theme === 'light' ? 'default' : 'light';
    localStorage.setItem('hkmodd-theme', next);
    withThemeTransition(() => {
      applyThemeToDom(next);
      set({ theme: next });
    });
  },

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

  // Canvas Perf
  canvasVisible: true,
  setCanvasVisible: (canvasVisible) => set({ canvasVisible }),

  // Telemetry HUD
  hudOpen: false,
  toggleHud: () => set((s) => ({ hudOpen: !s.hudOpen })),

  // Engine warm-up
  engineReady: false,
  setEngineReady: (engineReady) => set({ engineReady }),

  // A11y
  reducedMotion: getInitialReducedMotion(),
  reducedData: getInitialReducedData(),
}));
