import { useMemo, useRef, useCallback, useEffect, useState } from 'react';
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
//  PERSPECTIVE GRID - shader-based (unchanged)
// ═══════════════════════════════════════════════════════════════════

const gridVertexShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // ── Pointer-reactive warping ──
    vec2 gridCenter = uv - 0.5;
    vec2 pointerUV = uPointer;
    float pDist = length(gridCenter - pointerUV);
    float warp = exp(-pDist * 3.0) * 1.5;
    pos.z += warp * sin(uTime * 2.0 + pDist * 10.0) * 0.3;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const gridFragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uOpacity;

  void main() {
    // Scrolling grid
    vec2 uv = vUv + vec2(0.0, uTime * 0.012);
    vec2 coord = uv * 50.0;
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line = min(grid.x, grid.y);
    float alpha = 1.0 - min(line, 1.0);

    // Radial fade
    float dist = length(vUv - 0.5) * 2.0;
    alpha *= smoothstep(1.1, 0.1, dist);

    // ── Pointer glow hotspot ──
    vec2 gridCenter = vUv - 0.5;
    float pDist = length(gridCenter - uPointer);
    float hotspot = exp(-pDist * 4.0) * 0.35;
    alpha = alpha * 0.12 + hotspot;

    // ── Scan line sweep ──
    float scan = smoothstep(0.0, 0.02, abs(fract(uv.y * 2.0 - uTime * 0.05) - 0.5));
    alpha *= 0.8 + (1.0 - scan) * 0.4;

    // Ghost mode: global opacity multiplier for light theme
    alpha *= uOpacity;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

function PerspectiveGrid({ pointerRef }: { pointerRef: React.MutableRefObject<THREE.Vector3> }) {
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
    <mesh rotation={[-Math.PI / 2.2, 0, 0]} position={[0, -6, -3]}>
      <planeGeometry args={[60, 60, 32, 32]} />
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
        // Dark / redteam: deep black fog plane as before
        matRef.current.color.set('#000000');
        matRef.current.opacity = 0.6;
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
      {/* Invisible hit-test plane for pointer tracking */}
      <mesh visible={false} position={[0, 0, 0]} onPointerMove={handlePointerMove}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial />
      </mesh>

      {/* Deep background fog plane */}
      <DepthFog />

      {/* Perspective grid (beneath neural mesh) — desktop only: on a
          phone it reads as haze while costing a full-screen fragment pass */}
      {SIM.grid && <PerspectiveGrid pointerRef={pointerRef} />}

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
  const wasVisibleRef = useRef(true); // local guard against spamming the store

  const theme = useAppStore((s) => s.theme);

  // ── Scroll-synced fade ──
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

    // Update global visibility state only when crossing the threshold
    const isVisible = opacity > 0.01;
    if (isVisible !== wasVisibleRef.current) {
      wasVisibleRef.current = isVisible;
      useAppStore.getState().setCanvasVisible(isVisible);
    }
  }, []);

  useScrollProgress((progress) => applyFade(progress));

  // Re-apply on theme flip (light theme forces baseOpacity 0).
  useEffect(() => {
    applyFade(getScrollProgress());
  }, [theme, applyFade]);

  const canvasVisible = useAppStore((s) => s.canvasVisible);
  const reducedMotion = useAppStore((s) => s.reducedMotion);

  // Adaptive render resolution: starts at native, PerformanceMonitor drops
  // it ONLY if the device can't hold its refresh rate, then recovers.
  const [dpr, setDpr] = useState(getInitialDpr);

  // Ghost mode: pure white canvas for light theme
  const canvasBg = theme === 'light' ? '#ffffff' : 'transparent';

  // Completely disable 3D background if reduced motion is requested
  if (reducedMotion) return null;

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-0 pointer-events-none will-change-transform"
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
        style={{ background: canvasBg, pointerEvents: 'auto' }}
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
