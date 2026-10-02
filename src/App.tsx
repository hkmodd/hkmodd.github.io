import { memo, useCallback, useEffect, useState, lazy, Suspense, startTransition } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useKonamiCode } from '@/hooks/useKonamiCode';
import { useSnapScroll } from '@/hooks/useSnapScroll';
import { useMobileHapticScroll } from '@/hooks/useMobileHapticScroll';
import { haptic } from '@/lib/haptic';
import { applyThemeToDom } from '@/lib/themeDom';
import { stampRuntimeClass } from '@/lib/runtime';
import { startOffscreenAnimationPause } from '@/lib/offscreenAnimations';

import BootScreen from '@/components/BootScreen';
import CyberCursor from '@/components/CyberCursor';
import TelemetryHUD from '@/components/TelemetryHUD';
import ErrorBoundary from '@/components/ErrorBoundary';

// Lazy loaded components (code splitting) with named loaders so the boot
// window can prefetch every section chunk — by the time the boot screen
// lifts, mounting a section is a cache hit, not a network+parse hitch.
const loadNeuralMesh = () => import('@/components/canvas/NeuralMesh');
const loadArsenal = () => import('@/components/Arsenal');
const loadOperations = () => import('@/components/Operations');
const loadIdentity = () => import('@/components/Identity');
const loadCertVault = () => import('@/components/CertVault');
const loadAIIntel = () => import('@/components/AIIntel');
const loadTerminal = () => import('@/components/Terminal');
const loadContact = () => import('@/components/Contact');

// Everything that animates with `motion` is off the entry chunk: the lock
// renders without waiting on the animation library (43 KB gzip). The hero
// and the controls are rendered — suspended — from the first frame, so their
// chunks stream in while the lock is up and resolve long before the strike.
const loadFooter = () => import('@/components/Footer');
const Hero = lazy(() => import('@/components/Hero'));
const Footer = lazy(loadFooter);
const FloatingControls = lazy(() => import('@/components/FloatingControls'));
const ResetButton = lazy(() => import('@/components/ResetButton'));
const BackToTop = lazy(() => import('@/components/BackToTop'));

const NeuralMesh = lazy(loadNeuralMesh);
const Arsenal = lazy(loadArsenal);
const Operations = lazy(loadOperations);
const Identity = lazy(loadIdentity);
const CertVault = lazy(loadCertVault);
const AIIntel = lazy(loadAIIntel);
const Terminal = lazy(loadTerminal);
const Contact = lazy(loadContact);

export default function App() {
  const booted = useAppStore((s) => s.booted);
  const staged = useAppStore((s) => s.staged);

  // The store is read through useSyncExternalStore, whose updates always
  // render synchronously — startTransition around a zustand `set` does
  // nothing. These two gates are mirrored into React state so the big first
  // renders (hero on the strike, sections under the lock) are interruptible.
  const [entered, setEntered] = useState(booted);
  const [mainOn, setMainOn] = useState(booted || staged);
  useEffect(() => {
    if (booted && !entered) startTransition(() => setEntered(true));
  }, [booted, entered]);
  useEffect(() => {
    if ((booted || staged) && !mainOn) startTransition(() => setMainOn(true));
  }, [booted, staged, mainOn]);
  const theme = useAppStore((s) => s.theme);
  const showFlash = useAppStore((s) => s.showFlash);
  const toggleRedTeam = useAppStore((s) => s.toggleRedTeam);
  const flashDir = useAppStore((s) => s.flashDir);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const reducedData = useAppStore((s) => s.reducedData);

  // Auto-update: check for new version, clear cache & reload if stale
  useAutoUpdate();

  useEffect(() => {
    stampRuntimeClass();
  }, []);

  // Infinite CSS animations several screens away still cost a style pass per
  // frame. Paused off screen, played on approach.
  useEffect(() => startOffscreenAnimationPause(), []);

  useEffect(() => {
    document.documentElement.classList.toggle('booted', booted);
  }, [booted]);

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    // Lock screen is the gate. Engine compiles behind it; never block reveal.
    useAppStore.getState().setEngineReady(true);
  }, []);

  // Fetch every section chunk during the lock, then MOUNT them under it.
  // The lock is opaque and the user is reading it: the main thread is idle.
  // Mounting on `booted` instead put a full-page commit (~290 ms on a
  // throttled phone) inside the strike animation. As a transition, React
  // yields between sections, so the lock's own frames are never held up.
  useEffect(() => {
    const ric =
      (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    let cancelled = false;
    ric(() => {
      Promise.all([
        loadArsenal(),
        loadOperations(),
        loadIdentity(),
        loadCertVault(),
        loadAIIntel(),
        loadTerminal(),
        loadContact(),
        loadFooter(),
      ])
        .then(() => {
          if (cancelled) return;
          // Never commit under a finger: the drag on the lock is the one
          // thing on screen that must hold its frame rate.
          const stage = () => {
            if (cancelled) return;
            if (document.querySelector('.lock__plate[data-holding]')) {
              window.setTimeout(() => ric(stage, { timeout: 1500 }), 250);
              return;
            }
            useAppStore.getState().setStaged();
          };
          ric(stage, { timeout: 1500 });
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Snap-scroll: desktop section snapping on wheel/keyboard
  useSnapScroll();

  // Mobile mechanical wheel haptics
  useMobileHapticScroll();

  // Konami code → red team toggle
  useKonamiCode(
    useCallback(() => {
      haptic('heavy');
      toggleRedTeam();
    }, [toggleRedTeam])
  );

  return (
    <div data-theme={theme !== 'default' ? theme : undefined} className="app-root">
      {/* The lock unmounts itself once its own dissolve has finished —
          never on `booted`, which would cut the strike and snap the hero. */}
      <BootScreen />

      {/* 3D particle background — skipped on reduced-data / reduced-motion */}
      {!reducedData && !reducedMotion && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <NeuralMesh />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Custom cursor (desktop only) */}
      <CyberCursor />

      {/* Floating lang + theme controls */}
      <Suspense fallback={null}>
        <FloatingControls />
      </Suspense>

      {/* Engine telemetry overlay (` key / `hud` terminal command) */}
      <TelemetryHUD />

      {/* Film grain */}
      <div className="grain-overlay" />

      {/* CRT scanline sweep */}
      {booted && !new URLSearchParams(window.location.search).has('shot') && (
        <div className="crt-scanline" />
      )}

      {/* Screen flash on theme switch */}
      {showFlash && (
        <div
          className="screen-flash"
          style={{ animationName: flashDir === 'enter' ? 'flash' : 'flash-reverse' }}
        />
      )}

      {/* Hero – sticky, fades out on scroll (renders nothing until entered) */}
      <div data-snap>
        <Suspense fallback={null}>
          <Hero entered={entered} />
        </Suspense>
      </div>

      {/* Main content — staged under the opaque lock, or on boot at the latest */}
      {mainOn && <Sections />}
    </div>
  );
}

/**
 * Everything below the hero. Memoised with no props: App re-renders on boot,
 * theme flash and friends, and none of that may cascade into ~1200 nodes of
 * already-mounted sections — each section subscribes to what it reads.
 */
const Sections = memo(function Sections() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        {/* Main content – sits on top of faded hero */}
        <main className="main-content relative z-10">
          <div className="section-divider" />
          <div data-snap>
            <Arsenal />
          </div>

          <div className="section-divider" />
          <div data-snap>
            <Operations />
          </div>

          <div className="section-divider" />
          <div data-snap>
            <Identity />
          </div>

          <div className="section-divider" />
          <div data-snap>
            <CertVault />
          </div>

          <div className="section-divider" />
          <div data-snap>
            <AIIntel />
          </div>

          <div className="section-divider" />
          <div data-snap>
            <Terminal />
          </div>

          <div className="section-divider" />
          <div data-snap>
            <Contact />
          </div>
        </main>

        <Footer />

        {/* Floating reset button (red team only) */}
        <ResetButton />
        <BackToTop />
      </Suspense>
    </ErrorBoundary>
  );
});
