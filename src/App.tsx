import { useCallback, useEffect, lazy, Suspense } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useKonamiCode } from '@/hooks/useKonamiCode';
import { useSnapScroll } from '@/hooks/useSnapScroll';
import { useMobileHapticScroll } from '@/hooks/useMobileHapticScroll';
import { haptic } from '@/lib/haptic';
import { applyThemeToDom } from '@/lib/themeDom';

import BootScreen from '@/components/BootScreen';
import Hero from '@/components/Hero';
import Footer from '@/components/Footer';
import CyberCursor from '@/components/CyberCursor';
import ResetButton from '@/components/ResetButton';
import BackToTop from '@/components/BackToTop';
import FloatingControls from '@/components/FloatingControls';
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
  const theme = useAppStore((s) => s.theme);
  const showFlash = useAppStore((s) => s.showFlash);
  const toggleRedTeam = useAppStore((s) => s.toggleRedTeam);
  const flashDir = useAppStore((s) => s.flashDir);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const reducedData = useAppStore((s) => s.reducedData);

  // Auto-update: check for new version, clear cache & reload if stale
  useAutoUpdate();

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

  // Prefetch every section chunk during the boot window (idle time), so
  // the post-boot reveal mounts from cache with zero network/parse hitches.
  useEffect(() => {
    const prefetch = () => {
      loadArsenal();
      loadOperations();
      loadIdentity();
      loadCertVault();
      loadAIIntel();
      loadTerminal();
      loadContact();
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(prefetch);
    else setTimeout(prefetch, 300);
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
      {/* Boot stays mounted so AnimatePresence can finish the dissolve.
          Unmounting on `booted` was killing the exit and snapping the hero. */}
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
      <FloatingControls />

      {/* Engine telemetry overlay (` key / `hud` terminal command) */}
      <TelemetryHUD />

      {/* Film grain */}
      <div className="grain-overlay" />

      {/* CRT scanline sweep */}
      {booted && <div className="crt-scanline" />}

      {/* Screen flash on theme switch */}
      {showFlash && (
        <div
          className="screen-flash"
          style={{ animationName: flashDir === 'enter' ? 'flash' : 'flash-reverse' }}
        />
      )}

      {/* Hero – sticky, fades out on scroll (has its own !booted guard) */}
      <div data-snap>
        <Hero />
      </div>

      {/* Main content – only render AFTER boot completes (prevents FOUC) */}
      {booted && (
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
      )}
    </div>
  );
}
