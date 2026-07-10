import { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  Break,
  uniform,
  instancedArray,
  instanceIndex,
  uv,
  positionLocal,
  positionView,
  float,
  int,
  uint,
  vec3,
  vec4,
  sin,
  cos,
  exp,
  length,
  dot,
  max,
  clamp,
  smoothstep,
  step,
  mix,
  hash,
  floor,
  fract,
  abs,
  min,
  fwidth,
  vec2,
} from 'three/tsl';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useAppStore } from '@/store/useAppStore';
import { NODE_COUNT, PULSE_COUNT, CONNECTION_DIST } from '@/lib/neuralProtocol';
import { createNeuralLayout } from '@/lib/neuralLayout';
import { getInitialDpr, MIN_DPR } from '@/lib/quality';
import { getScrollProgress } from '@/lib/scrollProgress';
import { useScrollProgress } from '@/hooks/useScrollProgress';

/* ═══════════════════════════════════════════════════════════════════
   NEURAL MESH v5 — GPU-resident simulation (WebGPU / TSL compute).

   The per-frame physics ported from wasm/src/lib.rs runs entirely on the
   GPU as three compute kernels; node/connection/pulse data lives in GPU
   storage buffers that the render materials read directly as attributes.
   The CPU's whole per-frame job is: update a handful of uniforms and
   dispatch. Zero simulation math, zero buffer uploads on the main thread.

   Backend: WebGPU where available; three's WebGL2 backend otherwise
   (TSL transpiles to GLSL, compute runs via transform feedback). All
   kernels are written fallback-safe: no atomics, each thread writes only
   its own output index.
   ═══════════════════════════════════════════════════════════════════ */

extend(THREE as unknown as Parameters<typeof extend>[0]);

// Per-node connection budget. 6 slots × 450 nodes = 2700 instanced line
// segments, drawn every frame with degenerate (A==B) segments for empty
// slots — no compaction, no atomics, backend-portable.
const K_PER_NODE = 6;
const CONN_COUNT = NODE_COUNT * K_PER_NODE;

// Projection factor for px→world conversion at the reference viewport
// (720p, fov 55°): (h/2) / tan(fov/2) ≈ 360 / 0.5206 ≈ 691.6.
const PROJ_FACTOR = 691.6;

const tmpColor = new THREE.Color();

function themeHex(theme: string): string {
  return theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
}

/* ═══════════════════════════════════════════════════════════════════
   ENGINE — buffers, uniforms, kernels, materials (created once)
   ═══════════════════════════════════════════════════════════════════ */

function createEngine() {
  const layout = createNeuralLayout();

  // ── Uniforms (CPU → GPU, a few floats per frame) ──
  const uTime = uniform(0);
  const uDt = uniform(0);
  const uPointer = uniform(new THREE.Vector3(999, 999, 0));
  const uColor = uniform(new THREE.Color('#00d4ff'));
  const uBurst = uniform(1);
  const uTransMul = uniform(1);
  const uBoost = uniform(1);
  const uConnOpacity = uniform(0.7);
  const uPulseColor = uniform(new THREE.Color('#00d4ff').multiplyScalar(2));
  const uPulseOpacity = uniform(1);
  const uSeed = uniform(0);

  // ── Storage buffers ──
  const basePos = instancedArray(layout.basePositions, 'vec3');
  const baseOpac = instancedArray(layout.baseOpacities, 'float');
  const baseSize = instancedArray(layout.baseSizes, 'float');
  const phases = instancedArray(layout.phases, 'float');
  const speeds = instancedArray(layout.speeds, 'float');

  const livePos = instancedArray(NODE_COUNT, 'vec3');
  const liveOpac = instancedArray(NODE_COUNT, 'float');
  const liveSize = instancedArray(NODE_COUNT, 'float');

  const connA = instancedArray(CONN_COUNT, 'vec3');
  const connB = instancedArray(CONN_COUNT, 'vec3');
  const connCol = instancedArray(CONN_COUNT, 'vec3');

  const pulseFrom = instancedArray(layout.pulseFrom, 'float');
  const pulseTo = instancedArray(layout.pulseTo, 'float');
  const pulseProg = instancedArray(layout.pulseProgress, 'float');
  const pulseSpd = instancedArray(layout.pulseSpeed, 'float');
  const pulsePos = instancedArray(PULSE_COUNT, 'vec3');
  const pulseScale = instancedArray(PULSE_COUNT, 'float');

  // Every buffer READ inside a compute kernel needs PBO-texture backing on
  // the WebGL2 fallback backend (official examples do the same); harmless
  // no-op on real WebGPU.
  for (const b of [
    basePos, baseOpac, baseSize, phases, speeds,
    livePos, liveOpac, liveSize,
    pulseFrom, pulseTo, pulseProg, pulseSpd,
  ]) {
    (b as unknown as { setPBO?: (v: boolean) => void }).setPBO?.(true);
  }

  // ═══ KERNEL 1 — nodes: drift + pointer repulsion (port of lib.rs) ═══
  const computeNodes = Fn(() => {
    const i = instanceIndex;
    const base = basePos.element(i);
    const phase = phases.element(i).toVar();
    const speed = speeds.element(i).toVar();
    const t = uTime;

    const breathe = sin(t.mul(0.5)).mul(0.35);
    const pos = vec3(
      base.x.add(sin(t.mul(0.25).mul(speed).add(phase)).mul(1.2).mul(uBurst)),
      base.y.add(cos(t.mul(0.2).mul(speed).add(phase.mul(1.3))).mul(1.2).mul(uBurst)),
      base.z.add(sin(t.mul(0.15).mul(speed).add(phase.mul(0.7))).mul(0.6)).add(breathe),
    ).toVar();

    const d = pos.sub(uPointer).toVar();
    const dist = length(d).toVar();
    If(dist.lessThan(4.5).and(dist.greaterThan(0.001)), () => {
      const norm = float(1).sub(dist.div(4.5));
      const force = norm.mul(norm).mul(2.8);
      const push = d.div(dist).mul(force).mul(vec3(1, 1, 0.5));
      pos.assign(pos.add(push));
    });

    livePos.element(i).assign(pos);

    const pd = length(pos.xy.sub(uPointer.xy));
    const prox = max(float(1).sub(pd.div(6)), 0);
    liveOpac.element(i).assign(baseOpac.element(i).add(prox.mul(0.7)));
    liveSize.element(i).assign(baseSize.element(i).mul(prox.add(1)));
  })().compute(NODE_COUNT);

  // ═══ KERNEL 2 — connections: one thread per SEGMENT (instanced) ═══
  // Thread c owns (node i = c/K, slot s = c%K) and rescans i's forward
  // neighbours for its slot-th in-range partner. Redundant vs a shared
  // scan, but every thread writes only its own index into instancedArray
  // buffers — the one storage pattern portable to both WGSL compute and
  // the GLSL transform-feedback fallback.
  const computeConnections = Fn(() => {
    const c = instanceIndex;
    const nodeI = c.div(uint(K_PER_NODE)).toVar();
    const slotWanted = int(c.mod(uint(K_PER_NODE))).toVar();

    const a = livePos.element(nodeI).toVar();
    const found = int(-1).toVar();
    const cnt = int(0).toVar();
    const distSq = float(CONNECTION_DIST * CONNECTION_DIST);

    Loop({ start: int(nodeI).add(1), end: int(NODE_COUNT), type: 'int', condition: '<' }, ({ i: j }) => {
      If(cnt.greaterThan(slotWanted), () => {
        Break();
      });
      const b = livePos.element(j);
      const diff = a.sub(b);
      const dsq = dot(diff, diff);
      If(dsq.lessThan(distSq), () => {
        If(cnt.equal(slotWanted), () => {
          found.assign(j);
        });
        cnt.addAssign(1);
      });
    });

    // Default: degenerate segment (A==B rasterizes nothing) with black color.
    connA.element(c).assign(a);
    connB.element(c).assign(a);
    connCol.element(c).assign(vec3(0));

    If(found.greaterThanEqual(0), () => {
      const b = livePos.element(found).toVar();
      const dd = length(a.sub(b));
      const alpha = float(1).sub(dd.div(CONNECTION_DIST));
      const mid = a.add(b).mul(0.5);
      const pd = length(mid.xy.sub(uPointer.xy));
      const prox = max(float(1).sub(pd.div(4)), 0);
      const bright = alpha.mul(0.5).add(prox.mul(1.2)).mul(uTransMul);
      const avgZ = a.z.add(b.z).mul(0.5);
      const fog = smoothstep(float(-10), float(4), avgZ);
      const fb = bright.mul(fog.mul(0.7).add(0.3));

      connB.element(c).assign(b);
      connCol.element(c).assign(vec3(uColor).mul(fb));
    });
  })().compute(CONN_COUNT);

  // ═══ KERNEL 3 — pulses (port of lib.rs pulse pass) ═══
  const computePulses = Fn(() => {
    const i = instanceIndex;
    const prog = pulseProg.element(i).toVar();
    prog.addAssign(uDt.mul(pulseSpd.element(i)));

    If(prog.greaterThanEqual(1), () => {
      pulseFrom.element(i).assign(pulseTo.element(i));
      const h1 = hash(i.add(uint(uSeed)));
      pulseTo.element(i).assign(floor(h1.mul(NODE_COUNT)).min(NODE_COUNT - 1));
      prog.assign(0);
      const h2 = hash(i.add(uint(uSeed)).add(uint(7919)));
      pulseSpd.element(i).assign(h2.mul(0.8).add(0.3));
    });
    pulseProg.element(i).assign(prog);

    const f = livePos.element(uint(pulseFrom.element(i)));
    const tt = livePos.element(uint(pulseTo.element(i)));
    const arc = sin(prog.mul(Math.PI));
    const p = mix(f, tt, prog);
    pulsePos.element(i).assign(vec3(p.x, p.y, p.z.add(arc.mul(0.8))));
    pulseScale.element(i).assign(arc.mul(1.2).add(1));
  })().compute(PULSE_COUNT);

  // ═══ MATERIAL — nodes (instanced sprites; port of the GLSL shaders) ═══
  const nodeMat = new THREE.SpriteNodeMaterial();
  nodeMat.transparent = true;
  nodeMat.depthWrite = false;
  nodeMat.blending = THREE.AdditiveBlending;
  nodeMat.positionNode = livePos.toAttribute();
  // Faithful port of the GL sizing: px = clamp(aSize * 300/dist, 1, 12),
  // converted back to world units (world = px * dist / projFactor). The
  // group only rotates a few degrees, so camera-in-object-space ≈ (0,0,10).
  nodeMat.scaleNode = Fn(() => {
    const dist = length(livePos.toAttribute().sub(vec3(0, 0, 10))).max(0.1);
    const px = clamp(liveSize.toAttribute().mul(300).div(dist), 1, 12);
    return px.mul(dist).div(PROJ_FACTOR);
  })();
  nodeMat.colorNode = Fn(() => {
    const dC = length(uv().sub(0.5)).toVar();
    const vDist = positionView.z.negate().toVar();
    const defocus = smoothstep(float(4), float(16), vDist);
    const core = smoothstep(float(0), float(0.5), dC).oneMinus().mul(float(1).sub(defocus.mul(0.5)));
    const glow = exp(dC.mul(-4)).mul(0.8).mul(defocus.mul(0.6).add(1));
    const fogN = smoothstep(float(5), float(25), vDist).oneMinus();
    const alpha = clamp(
      core.add(glow).mul(liveOpac.toAttribute()).mul(fogN).mul(uBoost),
      0,
      1,
    ).mul(step(dC, float(0.5)));
    return vec4(vec3(uColor).mul(glow.mul(0.5).add(1)), alpha);
  })();

  // ═══ MATERIAL — connections ═══
  const connMat = new THREE.LineBasicNodeMaterial();
  connMat.transparent = true;
  connMat.depthWrite = false;
  connMat.blending = THREE.AdditiveBlending;
  // Instanced segment: base geometry is 2 verts with x = endpoint selector;
  // per-instance endpoints/colors stream in from the compute buffers.
  connMat.positionNode = mix(connA.toAttribute(), connB.toAttribute(), positionLocal.x);
  connMat.colorNode = vec4(connCol.toAttribute(), uConnOpacity);

  // ═══ MATERIAL — pulses ═══
  const pulseMat = new THREE.MeshBasicNodeMaterial();
  pulseMat.transparent = true;
  pulseMat.depthWrite = false;
  pulseMat.blending = THREE.AdditiveBlending;
  pulseMat.positionNode = positionLocal
    .mul(pulseScale.toAttribute())
    .add(pulsePos.toAttribute());
  pulseMat.colorNode = vec4(vec3(uPulseColor), uPulseOpacity);

  return {
    uniforms: {
      uTime, uDt, uPointer, uColor, uBurst, uTransMul, uBoost,
      uConnOpacity, uPulseColor, uPulseOpacity, uSeed,
    },
    kernels: { computeNodes, computeConnections, computePulses },
    materials: { nodeMat, connMat, pulseMat },
  };
}

/* ═══════════════════════════════════════════════════════════════════
   GRID — TSL port of the GLSL perspective grid
   ═══════════════════════════════════════════════════════════════════ */

function createGridMaterial() {
  const uGridColor = uniform(new THREE.Color('#00d4ff'));
  const uGridTime = uniform(0);
  const uGridPointer = uniform(new THREE.Vector2(0, 0));
  const uGridOpacity = uniform(1);

  const mat = new THREE.MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.DoubleSide;
  mat.blending = THREE.AdditiveBlending;

  // Vertex warp: pointer-reactive ripple
  mat.positionNode = Fn(() => {
    const gridCenter = uv().sub(0.5);
    const pDist = length(gridCenter.sub(uGridPointer));
    const warp = exp(pDist.mul(-3)).mul(1.5);
    const zOff = warp.mul(sin(uGridTime.mul(2).add(pDist.mul(10)))).mul(0.3);
    return positionLocal.add(vec3(0, 0, zOff));
  })();

  // Fragment: scrolling grid + radial fade + hotspot + scanline
  mat.colorNode = Fn(() => {
    const uvS = uv().add(vec2(0, uGridTime.mul(0.012)));
    const coord = uvS.mul(50);
    const grid = abs(fract(coord.sub(0.5)).sub(0.5)).div(fwidth(coord));
    const line = min(grid.x, grid.y);
    const alpha = float(1).sub(min(line, float(1))).toVar();

    const dist = length(uv().sub(0.5)).mul(2);
    alpha.mulAssign(smoothstep(float(1.1), float(0.1), dist));

    const gridCenter = uv().sub(0.5);
    const pDist = length(gridCenter.sub(uGridPointer));
    const hotspot = exp(pDist.mul(-4)).mul(0.35);
    alpha.assign(alpha.mul(0.12).add(hotspot));

    const scan = smoothstep(float(0), float(0.02), abs(fract(uvS.y.mul(2).sub(uGridTime.mul(0.05))).sub(0.5)));
    alpha.mulAssign(float(1).sub(scan).mul(0.4).add(0.8));

    alpha.mulAssign(uGridOpacity);
    return vec4(vec3(uGridColor), alpha);
  })();

  return { mat, uGridColor, uGridTime, uGridPointer, uGridOpacity };
}

/* ═══════════════════════════════════════════════════════════════════
   SCENE
   ═══════════════════════════════════════════════════════════════════ */

function DepthFog() {
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    const theme = useAppStore.getState().theme;
    if (matRef.current) {
      matRef.current.color.set(theme === 'light' ? '#ffffff' : '#000000');
      matRef.current.opacity = theme === 'light' ? 1.0 : 0.6;
    }
  });
  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[80, 80]} />
      <meshBasicMaterial ref={matRef} transparent opacity={0.6} color="#000000" depthWrite={false} />
    </mesh>
  );
}

function CursorGlow({ pointerRef }: { pointerRef: React.MutableRefObject<THREE.Vector3> }) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const p = pointerRef.current;
    const active = p.x < 100;
    g.visible = active;
    if (!active) return;
    g.position.copy(p);

    const theme = useAppStore.getState().theme;
    tmpColor.set(themeHex(theme));
    if (coreMatRef.current) coreMatRef.current.color.copy(tmpColor);
    if (haloMatRef.current) haloMatRef.current.color.copy(tmpColor);
    g.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 4) * 0.12);
    const dim = theme === 'light' ? 0.25 : 1;
    if (coreMatRef.current) coreMatRef.current.opacity = 0.9 * dim;
    if (haloMatRef.current) haloMatRef.current.opacity = 0.12 * dim;
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial ref={coreMatRef} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial ref={haloMatRef} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function NeuralMeshGPUScene() {
  const pointerRef = useRef(new THREE.Vector3(999, 999, 0));
  const groupRef = useRef<THREE.Group>(null!);

  // useFrame runs in rAF, outside React's error boundaries. Capture any
  // runtime failure of the compute path and re-throw it during render so
  // the selector's GPUBoundary can demote to the WebGL path.
  const [frameError, setFrameError] = useState<Error | null>(null);
  if (frameError) throw frameError;

  const engine = useMemo(createEngine, []);
  const grid = useMemo(createGridMaterial, []);

  // Sprite object with instance count (three's instanced-sprites path)
  const nodeSprite = useMemo(() => {
    const s = new THREE.Sprite(engine.materials.nodeMat);
    s.count = NODE_COUNT;
    s.frustumCulled = false;
    return s;
  }, [engine]);

  const connGeometry = useMemo(() => {
    // One 2-vertex segment, instanced CONN_COUNT times; x selects endpoint.
    const g = new THREE.InstancedBufferGeometry();
    g.instanceCount = CONN_COUNT;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    return g;
  }, []);

  const pulseGeo = useMemo(() => new THREE.SphereGeometry(0.04, 3, 3), []);

  const gridColorRef = useRef(new THREE.Color('#00d4ff'));

  const handlePointerMove = useCallback(
    (e: THREE.Event & { point: THREE.Vector3 }) => {
      pointerRef.current.copy(e.point);
    },
    []
  );

  useFrame(({ clock, gl }, delta) => {
    if (!useAppStore.getState().canvasVisible) return;
    const group = groupRef.current;
    if (!group) return;

    const t = clock.getElapsedTime();
    group.rotation.y = t * 0.015;
    group.rotation.x = Math.sin(t * 0.04) * 0.04;

    const { theme, redTeamTransitioning } = useAppStore.getState();
    const u = engine.uniforms;

    // ── Uniforms (the CPU's entire per-frame contribution) ──
    u.uTime.value = t;
    u.uDt.value = Math.min(delta, 0.1);
    u.uPointer.value.copy(pointerRef.current);
    u.uBurst.value = redTeamTransitioning ? 5 : 1;
    u.uTransMul.value = redTeamTransitioning ? 2 : 1;
    u.uSeed.value = (u.uSeed.value + 1) % 1000000;

    // Theme colour lerp (same 0.04 rate the WASM engine used)
    tmpColor.set(themeHex(theme));
    (u.uColor.value as THREE.Color).lerp(tmpColor, 0.04);

    u.uBoost.value = theme === 'light' ? 0.35 : 1.0;
    u.uConnOpacity.value = theme === 'light' ? 0 : 0.7;
    const cMul = theme === 'light' ? 0.08 : 2.0;
    (u.uPulseColor.value as THREE.Color).copy(u.uColor.value as THREE.Color).multiplyScalar(cMul);
    u.uPulseOpacity.value = theme === 'light' ? 0.03 : 1.0;

    const blend = theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
    engine.materials.nodeMat.blending = blend;
    engine.materials.connMat.blending = blend;
    engine.materials.pulseMat.blending = blend;

    // Grid uniforms
    gridColorRef.current.lerp(tmpColor.set(themeHex(theme)), 0.04);
    (grid.uGridColor.value as THREE.Color).copy(gridColorRef.current);
    grid.uGridTime.value = t;
    grid.uGridOpacity.value = theme === 'light' ? 0 : 1;
    (grid.uGridPointer.value as THREE.Vector2).set(pointerRef.current.x / 60, pointerRef.current.y / 60);
    grid.mat.blending = blend;

    // ── Dispatch the simulation on the GPU ──
    const renderer = gl as unknown as {
      compute?: (n: unknown) => void;
      computeAsync?: (n: unknown) => Promise<void>;
    };
    try {
      const dispatch = (renderer.compute ?? renderer.computeAsync)!.bind(renderer);
      dispatch(engine.kernels.computeNodes);
      dispatch(engine.kernels.computeConnections);
      dispatch(engine.kernels.computePulses);
    } catch (err) {
      setFrameError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  return (
    <>
      <mesh visible={false} position={[0, 0, 0]} onPointerMove={handlePointerMove}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial />
      </mesh>

      <DepthFog />

      <mesh rotation={[-Math.PI / 2.2, 0, 0]} position={[0, -6, -3]} material={grid.mat}>
        <planeGeometry args={[60, 60, 32, 32]} />
      </mesh>

      <CursorGlow pointerRef={pointerRef} />

      <group ref={groupRef}>
        <primitive object={nodeSprite} />
        <lineSegments geometry={connGeometry} material={engine.materials.connMat} frustumCulled={false} />
        <instancedMesh args={[pulseGeo, engine.materials.pulseMat, PULSE_COUNT]} frustumCulled={false} />
      </group>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EXPORT — Canvas wrapper (scroll fade / dpr / theme, same as GL path)
   ═══════════════════════════════════════════════════════════════════ */

export default function NeuralMeshGPU() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(true);
  const theme = useAppStore((s) => s.theme);

  const applyFade = useCallback((progress: number) => {
    const el = wrapperRef.current;
    if (!el) return;
    const t = Math.min(progress / 0.7, 1);
    const isLightTheme = useAppStore.getState().theme === 'light';
    const baseOpacity = isLightTheme ? 0 : 0.8;
    const opacity = baseOpacity * (1 - t);
    el.style.opacity = String(Math.max(opacity, 0));
    el.style.transform = `translateY(${t * -120}px)`;
    const isVisible = opacity > 0.01;
    if (isVisible !== wasVisibleRef.current) {
      wasVisibleRef.current = isVisible;
      useAppStore.getState().setCanvasVisible(isVisible);
    }
  }, []);

  useScrollProgress((progress) => applyFade(progress));
  useEffect(() => {
    applyFade(getScrollProgress());
  }, [theme, applyFade]);

  const canvasVisible = useAppStore((s) => s.canvasVisible);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const [dpr, setDpr] = useState(getInitialDpr);
  const canvasBg = theme === 'light' ? '#ffffff' : 'transparent';

  if (reducedMotion) return null;

  return (
    <div ref={wrapperRef} className="fixed inset-0 z-0 pointer-events-none will-change-transform">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 55, near: 0.1, far: 50 }}
        dpr={dpr}
        flat
        performance={{ min: 0.5 }}
        gl={async (glProps) => {
          const renderer = new THREE.WebGPURenderer({
            ...(glProps as ConstructorParameters<typeof THREE.WebGPURenderer>[0]),
            antialias: false,
            alpha: true,
            powerPreference: 'high-performance',
            forceWebGL: typeof navigator !== 'undefined' && !('gpu' in navigator),
          });
          await renderer.init();
          if (import.meta.env.DEV) {
            const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
            console.log(
              `%c⚡ Neural source ready [backend: ${backend?.isWebGPUBackend ? 'webgpu' : 'webgpu:webgl2-fallback'}]`,
              'color: #00d4ff; font-weight: bold',
            );
          }
          return renderer;
        }}
        style={{ background: canvasBg, pointerEvents: 'auto' }}
        frameloop={canvasVisible ? 'always' : 'demand'}
      >
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(MIN_DPR, +(d - 0.5).toFixed(2)))}
          onIncline={() => setDpr((d) => Math.min(getInitialDpr(), +(d + 0.5).toFixed(2)))}
          flipflops={3}
          onFallback={() => setDpr(MIN_DPR)}
        />
        <NeuralMeshGPUScene />
      </Canvas>
    </div>
  );
}
