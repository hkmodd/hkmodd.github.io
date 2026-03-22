import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useKonamiCode } from '@/hooks/useKonamiCode';
import { useSnapScroll } from '@/hooks/useSnapScroll';
import { haptic } from '@/lib/haptic';

import BootScreen from '@/components/BootScreen';
import Hero from '@/components/Hero';
import Arsenal from '@/components/Arsenal';
import Operations from '@/components/Operations';
import Identity from '@/components/Identity';
import AIIntel from '@/components/AIIntel';
import Terminal from '@/components/Terminal';
import Footer from '@/components/Footer';
import NeuralMesh from '@/components/canvas/NeuralMesh';
import CyberCursor from '@/components/CyberCursor';
import ResetButton from '@/components/ResetButton';
import BackToTop from '@/components/BackToTop';
import FloatingControls from '@/components/FloatingControls';

export default function App() {
  const booted = useAppStore((s) => s.booted);
  const theme = useAppStore((s) => s.theme);
  const showFlash = useAppStore((s) => s.showFlash);
  const toggleRedTeam = useAppStore((s) => s.toggleRedTeam);

  // Auto-update: check for new version, clear cache & reload if stale
  useAutoUpdate();

  // Snap-scroll: desktop section snapping on wheel/keyboard
  useSnapScroll();

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
      <NeuralMesh />

      {/* Custom cursor (desktop only) */}
      <CyberCursor />

      {/* Floating lang + theme controls */}
      <FloatingControls />

      {/* Film grain */}
      <div className="grain-overlay" />

      {/* CRT scanline sweep */}
      {booted && <div className="crt-scanline" />}

      {/* Screen flash on theme switch */}
      {showFlash && <div className="screen-flash" />}

      {/* Hero – sticky, fades out on scroll (has its own !booted guard) */}
      <div data-snap>
        <Hero />
      </div>

      {/* Main content – only render AFTER boot completes (prevents FOUC) */}
      {booted && (
        <>

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
        </>
      )}
    </div>
  );
}
