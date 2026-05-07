import { useCallback, lazy, Suspense } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useKonamiCode } from '@/hooks/useKonamiCode';
import { useSnapScroll } from '@/hooks/useSnapScroll';
import { useMobileHapticScroll } from '@/hooks/useMobileHapticScroll';
import { haptic } from '@/lib/haptic';

import BootScreen from '@/components/BootScreen';
import Hero from '@/components/Hero';
import Footer from '@/components/Footer';
import CyberCursor from '@/components/CyberCursor';
import ResetButton from '@/components/ResetButton';
import BackToTop from '@/components/BackToTop';
import FloatingControls from '@/components/FloatingControls';
import ErrorBoundary from '@/components/ErrorBoundary';

// Lazy loaded components (Code Splitting for performance)
const NeuralMesh = lazy(() => import('@/components/canvas/NeuralMesh'));
const Arsenal = lazy(() => import('@/components/Arsenal'));
const Operations = lazy(() => import('@/components/Operations'));
const Identity = lazy(() => import('@/components/Identity'));
const AIIntel = lazy(() => import('@/components/AIIntel'));
const Terminal = lazy(() => import('@/components/Terminal'));

export default function App() {
  const booted = useAppStore((s) => s.booted);
  const theme = useAppStore((s) => s.theme);
  const showFlash = useAppStore((s) => s.showFlash);
  const toggleRedTeam = useAppStore((s) => s.toggleRedTeam);
  const flashDir = useAppStore((s) => s.flashDir);

  // Auto-update: check for new version, clear cache & reload if stale
  useAutoUpdate();

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
      {/* Boot sequence */}
      {!booted && <BootScreen />}

      {/* 3D particle background */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <NeuralMesh />
        </Suspense>
      </ErrorBoundary>

      {/* Custom cursor (desktop only) */}
      <CyberCursor />

      {/* Floating lang + theme controls */}
      <FloatingControls />

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
          <AIIntel />
        </div>

        <div className="section-divider" />
        <div data-snap>
          <Terminal />
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
