import { useMemo, useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import DprGovernor from '@/components/canvas/DprGovernor';
import { useAppStore } from '@/store/useAppStore';
import { useNeuralSource } from '@/hooks/useNeuralSource';
import { getSimQuality, getInitialDpr, MIN_DPR } from '@/lib/quality';
import { neuralStats } from '@/lib/neuralStats';
import { getScrollProgress } from '@/lib/scrollProgress';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import * as THREE from 'three';

// Device-tier simulation size, chosen once at load.
const SIM = getSimQuality();
const IS_COARSE =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/* ═══════════════════════════════════════════════════════════════════
   NEURAL MESH v4 — Rust/WASM simulation, now off the main thread.

   The per-frame physics runs in a Web Worker (useNeuralSource). This
   component owns a SINGLE authoritative frame loop that pulls the freshest
   packed frame from the source and writes it into three GPU buffers
   (nodes / connections / pulses). GPU shaders are unchanged.
   ═════════════════════════════════════════════════════════════════ */

// ── Helpers ────────────────────────────────────────────────────────
const tmpColor = new THREE.Color();

// ═══════════════════════════════════════════════════════════════════
//  NODE SHADERS (unchanged)
// ═══════════════════════════════════════════════════════════════════

const nodeVertexShader = /* glsl */ `
  attribute float aOpacity;
  attribute float aSize;
  varying float vOpacity;
  varying float vDist;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuation with depth
    float size = aSize * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(size, 1.0, 12.0);

    vOpacity = aOpacity;
    vDist = -mvPosition.z;
  }
`;

const nodeFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBoost;
  uniform float uMinAlpha;
  varying float vOpacity;
  varying float vDist;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    // Soft glow falloff - brighter core, softer edge
    float core = smoothstep(0.5, 0.0, d);
    float glow = exp(-d * 4.0) * 0.8;

    // Subtle shallow-DOF: distant nodes drift toward soft bokeh (hard core
    // recedes, glow spreads), as if shot through a fast lens focused on the
    // mid layer. Kept gentle so the network silhouette reads the same.
    float defocus = smoothstep(4.0, 16.0, vDist);
    core *= (1.0 - defocus * 0.5);
    glow *= (1.0 + defocus * 0.6);

    float alpha = (core + glow) * vOpacity;

    // Depth-based fog
    float fog = smoothstep(25.0, 5.0, vDist);
    alpha *= fog;

    // Light-mode boost to stay visible on pale backgrounds
    alpha = clamp(alpha * uBoost, 0.0, 1.0);
    // Minimum alpha floor for light-mode (keeps particles visible on white)
    alpha = max(alpha, uMinAlpha * core * fog);

    gl_FragColor = vec4(uColor * (1.0 + glow * 0.5), alpha);
  }
`;

// ═══════════════════════════════════════════════════════════════════
//  AESTHETIC WAVE — crests only, no filled disc ("lake")
// ═══════════════════════════════════════════════════════════════════

const gridVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vCrest;
  varying float vDist;
  uniform float uTime;
  uniform vec2 uPointer;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float t = uTime;
    float x = position.x;
    float y = position.y;

    float w1 = sin(x * 0.28 + t * 0.72) * 1.15;
    float w2 = sin(y * 0.18 - t * 0.48 + x * 0.06) * 0.72;
    float w3 = sin((x * 0.7 + y) * 0.48 + t * 1.15) * 0.32;
    float w4 = sin(x * 1.15 - y * 0.7 + t * 1.9) * 0.14;

    vec2 gc = uv - 0.5;
    float pDist = length(gc - uPointer);
    float ripple = exp(-pDist * 3.4) * sin(t * 2.8 - pDist * 16.0) * 0.55;

    float h = w1 + w2 + w3 + w4 + ripple;
    pos.y += h * 0.45;
    pos.z += h * 0.22;
    vCrest = clamp(h * 0.5 + 0.38, 0.0, 1.0);
    vDist = length(uv - 0.5) * 2.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const gridFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying float vCrest;
  varying float vDist;
  uniform vec3 uColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uOpacity;

  void main() {
    // Ribbon: dissolve the top into void, keep sides soft. No floor horizon.
    float band = smoothstep(0.0, 0.12, vUv.y) * smoothstep(0.82, 0.36, vUv.y);
    float sides = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    float fade = band * sides;

    float foam = pow(smoothstep(0.48, 0.92, vCrest), 1.2);
    float ridges = 1.0 - smoothstep(0.0, 0.07, abs(fract(vCrest * 4.2) - 0.5));
    ridges *= smoothstep(0.35, 0.7, vCrest);

    vec2 drift = vUv + vec2(uTime * 0.01, 0.0);
    float cx = abs(fract(drift.x * 3.2) - 0.5);
    float cables = (1.0 - smoothstep(0.0, 0.012, cx)) * 0.12 * foam;

    float alpha = (foam * 0.55 + ridges * 0.85 + cables) * fade;
    alpha *= uOpacity;

    vec3 magenta = vec3(1.0, 0.16, 0.42);
    vec3 col = mix(mix(uColor, magenta, 0.42) * 0.7, uColor * 1.35, foam);

    gl_FragColor = vec4(col, alpha);
  }
`;

function AestheticWave({ pointerRef }: { pointerRef: React.MutableRefObject<THREE.Vector3> }) {
  const shaderRef = useRef<THREE.ShaderMaterial>(null!);
  const colorRef = useRef(new THREE.Color('#00d4ff'));

  useFrame(({ clock }) => {
    const mat = shaderRef.current;
    if (!mat) return;
    // Read store inside frame loop — avoids React re-render on theme change
    const theme = useAppStore.getState().theme;
    const targetColor = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
    colorRef.current.lerp(tmpColor.set(targetColor), 0.04);
    mat.uniforms.uColor.value.copy(colorRef.current);
    mat.uniforms.uTime.value = clock.getElapsedTime();
    // Ghost mode: barely visible grid in light theme
    // Light mode: grid hidden entirely — it adds gray wash
    mat.uniforms.uOpacity.value = theme === 'light' ? 0.0 : 1.0;

    const p = pointerRef.current;
    mat.uniforms.uPointer.value.set(p.x / 60, p.y / 60);

    // Blending depends on theme too — fold into this single frame callback
    mat.blending = theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
  });

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#00d4ff') },
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uOpacity: { value: 1.0 },
    }),
    []
  );

  return (
    <mesh rotation={[-1.02, 0.22, 0]} position={[1.1, -3.4, 2.5]}>
      <planeGeometry args={[30, 11, SIM.waveSegX, SIM.waveSegY]} />
      <shaderMaterial
        ref={shaderRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={gridVertexShader}
        fragmentShader={gridFragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  VOLUMETRIC FOG PLANE (unchanged)
// ═══════════════════════════════════════════════════════════════════

function DepthFog() {
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame(() => {
    const theme = useAppStore.getState().theme;
    if (matRef.current) {
      if (theme === 'light') {
        // Ghost mode: white fog pushes far particles out of sight
        matRef.current.color.set('#ffffff');
        matRef.current.opacity = 1.0;
      } else {
        // Dark is already void — a black quad read as a lake.
        matRef.current.opacity = 0.0;
      }
    }
  });

  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[80, 80]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        opacity={0.6}
        color="#000000"
        depthWrite={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  CURSOR GLOW (unchanged) — additive orb that rides the pointer's 3D
//  position, hidden until the pointer enters the canvas (sentinel 999).
// ═══════════════════════════════════════════════════════════════════
function CursorGlow({ pointerRef }: { pointerRef: React.MutableRefObject<THREE.Vector3> }) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const p = pointerRef.current;
    const active = p.x < 100; // sentinel 999 = pointer not yet over the canvas
    g.visible = active;
    if (!active) return;

    g.position.copy(p);

    const theme = useAppStore.getState().theme;
    const hex = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
    tmpColor.set(hex);
    if (coreMatRef.current) coreMatRef.current.color.copy(tmpColor);
    if (haloMatRef.current) haloMatRef.current.color.copy(tmpColor);

    // Gentle breathing
    g.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 4) * 0.12);

    // Light theme: dim so the white canvas stays pristine
    const dim = theme === 'light' ? 0.25 : 1;
    if (coreMatRef.current) coreMatRef.current.opacity = 0.9 * dim;
    if (haloMatRef.current) haloMatRef.current.opacity = 0.12 * dim;
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Hot core */}
      <mesh>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial ref={coreMatRef} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Soft halo */}
      <mesh>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial ref={haloMatRef} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  SCENE — one authoritative frame loop drives all three WASM meshes.
// ═══════════════════════════════════════════════════════════════════

function NeuralMeshScene() {
  const pointerRef = useRef(new THREE.Vector3(999, 999, 0));
  const groupRef = useRef<THREE.Group>(null!);
  const { source, ready } = useNeuralSource();

  // Boot-screen handshake: a few produced frames = shaders compiled,
  // worker (or inline WASM) alive, first-use hitches absorbed.
  const warmFrames = useRef(0);

  // ── Node buffers ──
  const nodeMatRef = useRef<THREE.ShaderMaterial>(null!);
  const { nodeGeometry, nodePosAttr, nodeOpacAttr, nodeSizeAttr, nodeUniforms } = useMemo(() => {
    const posArr = new Float32Array(SIM.nodes * 3);
    const opacArr = new Float32Array(SIM.nodes);
    const sizeArr = new Float32Array(SIM.nodes);
    const nodePosAttr = new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage);
    const nodeOpacAttr = new THREE.BufferAttribute(opacArr, 1).setUsage(THREE.DynamicDrawUsage);
    const nodeSizeAttr = new THREE.BufferAttribute(sizeArr, 1).setUsage(THREE.DynamicDrawUsage);
    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', nodePosAttr);
    nodeGeometry.setAttribute('aOpacity', nodeOpacAttr);
    nodeGeometry.setAttribute('aSize', nodeSizeAttr);
    const nodeUniforms = {
      uColor: { value: new THREE.Color('#00d4ff') },
      uBoost: { value: 1.0 },
      uMinAlpha: { value: 0.0 },
    };
    return { nodeGeometry, nodePosAttr, nodeOpacAttr, nodeSizeAttr, nodeUniforms };
  }, []);

  // ── Connection buffers ──
  const connMatRef = useRef<THREE.LineBasicMaterial>(null!);
  const { connGeometry, connPosAttr, connColAttr } = useMemo(() => {
    const posArr = new Float32Array(SIM.maxConnections * 6);
    const colArr = new Float32Array(SIM.maxConnections * 6);
    const connPosAttr = new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage);
    const connColAttr = new THREE.BufferAttribute(colArr, 3).setUsage(THREE.DynamicDrawUsage);
    const connGeometry = new THREE.BufferGeometry();
    connGeometry.setAttribute('position', connPosAttr);
    connGeometry.setAttribute('color', connColAttr);
    return { connGeometry, connPosAttr, connColAttr };
  }, []);

  // ── Pulse instanced mesh ──
  const pulseMeshRef = useRef<THREE.InstancedMesh>(null!);
  const prevPulseColorKey = useRef('');
  const pulseGeo = useMemo(() => new THREE.SphereGeometry(0.04, 3, 3), []);
  const pulseMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      toneMapped: false,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    }),
    []
  );

  const handlePointerMove = useCallback(
    (e: THREE.Event & { point: THREE.Vector3 }) => {
      pointerRef.current.copy(e.point);
    },
    []
  );

  useFrame(({ clock, gl }, delta) => {
    // ── Skip expensive work when canvas is scrolled off-screen ──
    if (!useAppStore.getState().canvasVisible) return;

    const group = groupRef.current;
    if (!group) return;

    // Slow rotation
    const t = clock.getElapsedTime();
    group.rotation.y = t * 0.015;
    group.rotation.x = Math.sin(t * 0.04) * 0.04;

    if (!source) return;

    // ── Telemetry (plain assignments — read by the HUD at its own pace) ──
    neuralStats.backend = source.mode === 'inline' ? 'wasm-inline' : 'wasm-worker';
    neuralStats.nodes = SIM.nodes;
    neuralStats.connCap = SIM.maxConnections;
    neuralStats.pulses = SIM.pulses;
    neuralStats.resW = gl.domElement.width;
    neuralStats.resH = gl.domElement.height;
    neuralStats.dpr = gl.getPixelRatio();

    // ── Per-frame inputs (theme colour resolved on the main thread) ──
    const { theme, redTeamTransitioning } = useAppStore.getState();
    const targetColor = theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
    tmpColor.set(targetColor);
    const p = pointerRef.current;

    const frame = source.update({
      dt: delta,
      px: p.x,
      py: p.y,
      pz: p.z,
      r: tmpColor.r,
      g: tmpColor.g,
      b: tmpColor.b,
      transitioning: redTeamTransitioning,
    });
    if (!frame) return;
    neuralStats.connections = frame.connCount;
    if (warmFrames.current < 3 && ++warmFrames.current === 3) {
      useAppStore.getState().setEngineReady(true);
    }

    // ══ NODES ══
    (nodePosAttr.array as Float32Array).set(frame.positions);
    (nodeOpacAttr.array as Float32Array).set(frame.opacities);
    (nodeSizeAttr.array as Float32Array).set(frame.sizes);
    nodePosAttr.needsUpdate = true;
    nodeOpacAttr.needsUpdate = true;
    nodeSizeAttr.needsUpdate = true;

    nodeUniforms.uColor.value.setRGB(frame.colorR, frame.colorG, frame.colorB);
    const nodeMat = nodeMatRef.current;
    if (nodeMat) {
      nodeMat.blending = theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
    }
    nodeUniforms.uBoost.value = theme === 'light' ? 0.35 : 1.0;
    nodeUniforms.uMinAlpha.value = 0.0;

    // ══ CONNECTIONS ══
    const used = frame.connCount * 6; // active floats; the rest is stale/never drawn
    (connPosAttr.array as Float32Array).set(frame.connPositions.subarray(0, used));
    (connColAttr.array as Float32Array).set(frame.connColors.subarray(0, used));
    connPosAttr.clearUpdateRanges();
    connPosAttr.addUpdateRange(0, used);
    connPosAttr.needsUpdate = true;
    connColAttr.clearUpdateRanges();
    connColAttr.addUpdateRange(0, used);
    connColAttr.needsUpdate = true;

    // Light mode: hide connections entirely — they compound into gray.
    connGeometry.setDrawRange(0, theme === 'light' ? 0 : frame.connCount * 2);
    const connMat = connMatRef.current;
    if (connMat) {
      connMat.blending = theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
      connMat.opacity = theme === 'light' ? 0 : 0.7;
    }

    // ══ PULSES ══
    const mesh = pulseMeshRef.current;
    if (mesh) {
      (mesh.instanceMatrix.array as Float32Array).set(frame.pulseMatrices);
      mesh.instanceMatrix.needsUpdate = true;

      const cMul = theme === 'light' ? 0.08 : 2.0;
      const colorKey = `${(frame.colorR * 100) | 0},${(frame.colorG * 100) | 0},${(frame.colorB * 100) | 0},${theme}`;
      if (colorKey !== prevPulseColorKey.current) {
        prevPulseColorKey.current = colorKey;
        tmpColor.setRGB(frame.colorR * cMul, frame.colorG * cMul, frame.colorB * cMul);
        for (let i = 0; i < SIM.pulses; i++) mesh.setColorAt(i, tmpColor);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      pulseMat.blending = theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
      pulseMat.opacity = theme === 'light' ? 0.03 : 1.0;
    }
  });

  return (
    <>
      {/* Desktop only — R3F hit plane + canvas events steal the mobile pan. */}
      {!IS_COARSE && (
        <mesh visible={false} position={[0, 0, 0]} onPointerMove={handlePointerMove}>
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial />
        </mesh>
      )}

      {useAppStore.getState().theme === 'light' && <DepthFog />}

      {/* Perspective grid (beneath neural mesh) — desktop only: on a
          phone it reads as haze while costing a full-screen fragment pass */}
      {SIM.grid && !new URLSearchParams(window.location.search).has('nowave') && (
        <AestheticWave pointerRef={pointerRef} />
      )}

      {/* Cursor-reactive glow — rides the pointer in world space */}
      <CursorGlow pointerRef={pointerRef} />

      {/* Neural network group with parallax */}
      <group ref={groupRef}>
        {ready && (
          <>
            <points geometry={nodeGeometry} frustumCulled={false}>
              <shaderMaterial
                ref={nodeMatRef}
                vertexShader={nodeVertexShader}
                fragmentShader={nodeFragmentShader}
                uniforms={nodeUniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </points>

            <lineSegments geometry={connGeometry} frustumCulled={false}>
              <lineBasicMaterial
                ref={connMatRef}
                vertexColors
                transparent
                opacity={0.7}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </lineSegments>

            <instancedMesh ref={pulseMeshRef} args={[pulseGeo, pulseMat, SIM.pulses]} frustumCulled={false} />
          </>
        )}
      </group>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  EXPORT - Canvas with depth-aware camera settings
// ═══════════════════════════════════════════════════════════════════

export default function NeuralMesh() {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const theme = useAppStore((s) => s.theme);

  // ── Scroll-synced fade ──
  // Keep the GL context mounted across theme toggles. Light only zeros
  // opacity + pauses the frameloop — unmounting left canvasVisible=false
  // and a remounted wasVisibleRef that never wrote the store back to true.
  const applyFade = useCallback((progress: number) => {
    const el = wrapperRef.current;
    if (!el) return;

    const t = Math.min(progress / 0.7, 1);
    // Light mode: hide canvas entirely — white bg must stay pristine
    const isLightTheme = useAppStore.getState().theme === 'light';
    const baseOpacity = isLightTheme ? 0 : 0.8;
    const opacity = baseOpacity * (1 - t);
    const yShift = t * -120;

    el.style.opacity = String(Math.max(opacity, 0));
    el.style.transform = `translateY(${yShift}px)`;

    const isVisible = !isLightTheme && opacity > 0.01 && !document.hidden;
    if (useAppStore.getState().canvasVisible !== isVisible) {
      useAppStore.getState().setCanvasVisible(isVisible);
    }
  }, []);

  useScrollProgress((progress) => applyFade(progress));

  useLayoutEffect(() => {
    applyFade(getScrollProgress());
  }, [theme, applyFade]);

  useEffect(() => {
    const sync = () => {
      document.documentElement.classList.toggle('tab-hidden', document.hidden);
      applyFade(getScrollProgress());
    };
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [applyFade]);

  const canvasVisible = useAppStore((s) => s.canvasVisible);
  const reducedMotion = useAppStore((s) => s.reducedMotion);

  // Adaptive render resolution: starts at native, PerformanceMonitor drops
  // it ONLY if the device can't hold its refresh rate, then recovers.
  const [dpr, setDpr] = useState(getInitialDpr);

  // Ghost mode: pure white canvas for light theme
  const canvasBg = theme === 'light' ? '#ffffff' : 'transparent';

  if (reducedMotion) return null;

  return (
    <div
      ref={wrapperRef}
      className="neural-canvas fixed inset-0 z-0 pointer-events-none"
    >
      <Canvas
        camera={{
          position: [0, 0, 10],
          fov: 55,
          near: 0.1,
          far: 50,
        }}
        dpr={dpr}
        flat
        performance={{ min: 0.5 }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        style={{ background: canvasBg, pointerEvents: IS_COARSE ? 'none' : 'auto', touchAction: 'pan-y' }}
        frameloop={canvasVisible ? 'always' : 'demand'}
      >
        {/* Self-tuning quality: keep FPS pinned to the display by trading
            render resolution, never by capping the framerate. */}
        <DprGovernor
          onDecline={() => setDpr((d) => Math.max(MIN_DPR, +(d - 0.5).toFixed(2)))}
          onIncline={() => setDpr((d) => Math.min(getInitialDpr(), +(d + 0.5).toFixed(2)))}
          flipflops={3}
          onFallback={() => setDpr(MIN_DPR)}
        />
        <NeuralMeshScene />
      </Canvas>
    </div>
  );
}
