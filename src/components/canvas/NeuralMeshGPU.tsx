import { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  uniform,
  instancedArray,
  instanceIndex,
  vertexIndex,
  select,
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
import DprGovernor from '@/components/canvas/DprGovernor';
import { useAppStore } from '@/store/useAppStore';
import { getSimQuality } from '@/lib/quality';
import { createNeuralLayout } from '@/lib/neuralLayout';
import { getInitialDpr, MIN_DPR } from '@/lib/quality';
import { neuralStats } from '@/lib/neuralStats';
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

// Device-tier simulation size, chosen once at load.
const SIM = getSimQuality();

// Per-node connection budget: K slots × nodes = fixed segment pool, drawn
// every frame with degenerate (A==B) segments for empty slots — no
// compaction, no atomics, backend-portable.
const K_PER_NODE = SIM.kPerNode;
const CONN_COUNT = SIM.nodes * K_PER_NODE;

// Uniform grid for bounded-neighborhood connections (no atomics).
// Cell size ≈ connectionDist so a 3×3×3 Moore neighbourhood is complete.
// Each cell holds GRID_SLOTS last-writer-wins slots — portable across
// WGSL compute and the GLSL transform-feedback fallback.
const GRID_DIM = 16;
const GRID_SLOTS = 4;
const GRID_HALF = 22.0;
const GRID_CELLS = GRID_DIM * GRID_DIM * GRID_DIM;
const GRID_LEN = GRID_CELLS * GRID_SLOTS;
const CELL_SIZE = (2 * GRID_HALF) / GRID_DIM;

// tan(fov/2) for the fixed 55° camera — used to convert the original
// gl_PointSize device-pixel sizing into world units at any resolution.
const TAN_HALF_FOV = Math.tan((55 * Math.PI) / 180 / 2);

const tmpColor = new THREE.Color();

function themeHex(theme: string): string {
  return theme === 'redteam' ? '#ff0033' : theme === 'light' ? '#0066cc' : '#00d4ff';
}

/* ═══════════════════════════════════════════════════════════════════
   ENGINE — buffers, uniforms, kernels, materials (created once)
   ═══════════════════════════════════════════════════════════════════ */

function createEngine() {
  const layout = createNeuralLayout(SIM.nodes, SIM.pulses);

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
  // (drawing-buffer height / 2) / tan(fov/2) — updated per frame so the
  // px→world size conversion tracks the real canvas like gl_PointSize did.
  const uProjFactor = uniform(691.6);

  // ── Storage buffers ──
  const basePos = instancedArray(layout.basePositions, 'vec3');
  const baseOpac = instancedArray(layout.baseOpacities, 'float');
  const baseSize = instancedArray(layout.baseSizes, 'float');
  const phases = instancedArray(layout.phases, 'float');
  const speeds = instancedArray(layout.speeds, 'float');

  const livePos = instancedArray(SIM.nodes, 'vec3');
  const liveOpac = instancedArray(SIM.nodes, 'float');
  const liveSize = instancedArray(SIM.nodes, 'float');

  const connA = instancedArray(CONN_COUNT, 'vec3');
  const connB = instancedArray(CONN_COUNT, 'vec3');
  const connCol = instancedArray(CONN_COUNT, 'vec3');

  const pulseFrom = instancedArray(layout.pulseFrom, 'float');
  const pulseTo = instancedArray(layout.pulseTo, 'float');
  const pulseProg = instancedArray(layout.pulseProgress, 'float');
  const pulseSpd = instancedArray(layout.pulseSpeed, 'float');
  const pulsePos = instancedArray(SIM.pulses, 'vec3');
  const pulseScale = instancedArray(SIM.pulses, 'float');

  // Cell occupancy as float indices (-1 = empty). Float storage is the
  // portable type on the WebGL2 transform-feedback fallback.
  const gridSlot = instancedArray(GRID_LEN, 'float');

  // Every buffer READ inside a compute kernel or by index in a render
  // shader needs PBO-texture backing on the WebGL2 fallback backend
  // (official examples do the same); harmless no-op on real WebGPU.
  for (const b of [
    basePos, baseOpac, baseSize, phases, speeds,
    livePos, liveOpac, liveSize,
    connA, connB, connCol,
    pulseFrom, pulseTo, pulseProg, pulseSpd,
    gridSlot,
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
  })().compute(SIM.nodes);

  // ═══ KERNEL 2a — clear grid slots (one thread per slot) ═══
  const computeClearGrid = Fn(() => {
    gridSlot.element(instanceIndex).assign(float(-1));
  })().compute(GRID_LEN);

  // ═══ KERNEL 2b — scatter each node into its cell (last-writer-wins) ═══
  const computeScatter = Fn(() => {
    const i = instanceIndex;
    const p = livePos.element(i);
    const inv = float(1 / CELL_SIZE);
    const half = float(GRID_HALF);
    const dimMax = float(GRID_DIM - 0.001);
    const dimi = int(GRID_DIM);
    const cx = int(clamp(p.x.add(half).mul(inv), float(0), dimMax));
    const cy = int(clamp(p.y.add(half).mul(inv), float(0), dimMax));
    const cz = int(clamp(p.z.add(half).mul(inv), float(0), dimMax));
    const cell = cx.add(cy.mul(dimi)).add(cz.mul(dimi).mul(dimi));
    const slot = int(i.mod(uint(GRID_SLOTS)));
    gridSlot.element(cell.mul(int(GRID_SLOTS)).add(slot)).assign(float(i));
  })().compute(SIM.nodes);

  // ═══ KERNEL 2c — connections: 27-cell × SLOTS neighbourhood ═══
  // Thread c owns (node i = c/K, slot s = c%K) and scans only the
  // Moore neighbourhood of i's cell. Each thread writes only its own
  // index — portable across WGSL compute and GLSL transform-feedback.
  const computeConnections = Fn(() => {
    const c = instanceIndex;
    const nodeI = int(c.div(uint(K_PER_NODE))).toVar();
    const slotWanted = int(c.mod(uint(K_PER_NODE))).toVar();

    const a = livePos.element(nodeI).toVar();
    const found = int(-1).toVar();
    const cnt = int(0).toVar();
    const distSq = float(SIM.connectionDist * SIM.connectionDist);

    const inv = float(1 / CELL_SIZE);
    const half = float(GRID_HALF);
    const dimMax = float(GRID_DIM - 0.001);
    const dimi = int(GRID_DIM);
    const icx = int(clamp(a.x.add(half).mul(inv), float(0), dimMax)).toVar();
    const icy = int(clamp(a.y.add(half).mul(inv), float(0), dimMax)).toVar();
    const icz = int(clamp(a.z.add(half).mul(inv), float(0), dimMax)).toVar();

    // Fixed-bound 108-iteration loop (27 cells × 4 slots). Straight-line
    // select accumulation — no Break, no divergent writes.
    Loop({ start: int(0), end: int(27 * GRID_SLOTS), type: 'int', condition: '<' }, ({ i: n }) => {
      const neigh = n.div(int(GRID_SLOTS));
      const slot = n.mod(int(GRID_SLOTS));
      const ndx = neigh.mod(int(3)).sub(int(1));
      const ndy = neigh.div(int(3)).mod(int(3)).sub(int(1));
      const ndz = neigh.div(int(9)).sub(int(1));
      const nx = icx.add(ndx);
      const ny = icy.add(ndy);
      const nz = icz.add(ndz);
      const inside = nx.greaterThanEqual(0).and(nx.lessThan(dimi))
        .and(ny.greaterThanEqual(0)).and(ny.lessThan(dimi))
        .and(nz.greaterThanEqual(0)).and(nz.lessThan(dimi));
      const cell = nx.add(ny.mul(dimi)).add(nz.mul(dimi).mul(dimi));
      const safeCell = select(inside, cell, int(0));
      const raw = gridSlot.element(safeCell.mul(int(GRID_SLOTS)).add(slot));
      const j = int(raw);
      const valid = inside.and(raw.greaterThanEqual(0)).and(j.greaterThan(nodeI));
      const b = livePos.element(select(j.greaterThanEqual(0), uint(j), uint(0)));
      const diff = a.sub(b);
      const dsq = dot(diff, diff);
      const hit = valid.and(dsq.lessThan(distSq));
      found.assign(select(hit.and(cnt.equal(slotWanted)), j, found));
      cnt.addAssign(select(hit, int(1), int(0)));
    });

    // Default: degenerate segment (A==B rasterizes nothing) with black color.
    connA.element(c).assign(a);
    connB.element(c).assign(a);
    connCol.element(c).assign(vec3(0));

    If(found.greaterThanEqual(0), () => {
      const b = livePos.element(found).toVar();
      const dd = length(a.sub(b));
      const alpha = float(1).sub(dd.div(SIM.connectionDist));
      const mid = a.add(b).mul(0.5);
      const pd = length(mid.xy.sub(uPointer.xy));
      const prox = max(float(1).sub(pd.div(4)), 0);
      const bright = alpha.mul(0.5).add(prox.mul(1.2)).mul(uTransMul);
      const avgZ = a.z.add(b.z).mul(0.5);
      const fog = smoothstep(float(-10), float(4), avgZ);
      const fb = bright.mul(fog.mul(0.7).add(0.3));

      connB.element(c).assign(b);
      connCol.element(c).assign(uColor.rgb.mul(fb));
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
      pulseTo.element(i).assign(floor(h1.mul(SIM.nodes)).min(SIM.nodes - 1));
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
  })().compute(SIM.pulses);

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
    return px.mul(dist).div(uProjFactor);
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
    return vec4(uColor.rgb.mul(glow.mul(0.5).add(1)), alpha);
  })();

  // ═══ MATERIAL — connections ═══
  const connMat = new THREE.LineBasicNodeMaterial();
  connMat.transparent = true;
  connMat.depthWrite = false;
  connMat.blending = THREE.AdditiveBlending;
  // Plain (non-instanced) LineSegments: each of the CONN_COUNT*2 vertices
  // computes its segment index and reads endpoints/colors straight from
  // the compute storage buffers by index — no instanced line draw, no
  // per-instance attributes, just the vertexIndex pattern verified on
  // both node builders.
  connMat.positionNode = Fn(() => {
    const c = vertexIndex.div(uint(2));
    const endpoint = float(vertexIndex.mod(uint(2)));
    return mix(connA.element(c), connB.element(c), endpoint);
  })();
  connMat.colorNode = Fn(() => {
    const c = vertexIndex.div(uint(2));
    return vec4(connCol.element(c), uConnOpacity);
  })();

  // ═══ MATERIAL — pulses ═══
  const pulseMat = new THREE.MeshBasicNodeMaterial();
  pulseMat.transparent = true;
  pulseMat.depthWrite = false;
  pulseMat.blending = THREE.AdditiveBlending;
  pulseMat.positionNode = positionLocal
    .mul(pulseScale.toAttribute())
    .add(pulsePos.toAttribute());
  pulseMat.colorNode = vec4(uPulseColor.rgb, uPulseOpacity);

  return {
    uniforms: {
      uTime, uDt, uPointer, uColor, uBurst, uTransMul, uBoost,
      uConnOpacity, uPulseColor, uPulseOpacity, uSeed, uProjFactor,
    },
    kernels: { computeNodes, computeClearGrid, computeScatter, computeConnections, computePulses },
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
    return vec4(uGridColor.rgb, alpha);
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

  // Boot-screen handshake: after a few real simulated+rendered frames the
  // WGSL pipelines are compiled and the first-use hitches are behind us.
  const warmFrames = useRef(0);

  const engine = useMemo(createEngine, []);
  const grid = useMemo(createGridMaterial, []);

  // Sprite object with instance count (three's instanced-sprites path)
  const nodeSprite = useMemo(() => {
    const s = new THREE.Sprite(engine.materials.nodeMat);
    s.count = SIM.nodes;
    s.frustumCulled = false;
    return s;
  }, [engine]);

  const connGeometry = useMemo(() => {
    // Dummy positions — the material's positionNode sources the real
    // endpoints from the compute storage buffers via vertexIndex.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CONN_COUNT * 2 * 3), 3));
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
    const dom = (gl as unknown as { domElement?: HTMLCanvasElement }).domElement;
    const bufH = dom?.height ?? 720;
    u.uProjFactor.value = (bufH * 0.5) / TAN_HALF_FOV;

    // ── Telemetry (plain assignments — read by the HUD at its own pace) ──
    neuralStats.nodes = SIM.nodes;
    neuralStats.pulses = SIM.pulses;
    neuralStats.connections = -1; // GPU-resident: the CPU never sees the count
    neuralStats.connCap = CONN_COUNT;
    neuralStats.resW = dom?.width ?? 0;
    neuralStats.resH = bufH;
    neuralStats.dpr = (gl as unknown as { getPixelRatio?: () => number }).getPixelRatio?.() ?? 1;

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
      dispatch(engine.kernels.computeClearGrid);
      dispatch(engine.kernels.computeScatter);
      dispatch(engine.kernels.computeConnections);
      dispatch(engine.kernels.computePulses);
      if (warmFrames.current < 3 && ++warmFrames.current === 3) {
        useAppStore.getState().setEngineReady(true);
      }
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

      {SIM.grid && (
        <mesh rotation={[-Math.PI / 2.2, 0, 0]} position={[0, -6, -3]} material={grid.mat}>
          <planeGeometry args={[60, 60, 32, 32]} />
        </mesh>
      )}

      <CursorGlow pointerRef={pointerRef} />

      <group ref={groupRef}>
        <primitive object={nodeSprite} />
        <lineSegments geometry={connGeometry} material={engine.materials.connMat} frustumCulled={false} />
        <instancedMesh args={[pulseGeo, engine.materials.pulseMat, SIM.pulses]} frustumCulled={false} />
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
          const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
          neuralStats.backend = backend?.isWebGPUBackend ? 'webgpu' : 'webgpu:webgl2-fallback';
          if (import.meta.env.DEV) {
            console.log(
              `%c⚡ Neural source ready [backend: ${neuralStats.backend}]`,
              'color: #00d4ff; font-weight: bold',
            );
          }
          return renderer;
        }}
        style={{ background: canvasBg, pointerEvents: 'auto' }}
        frameloop={canvasVisible ? 'always' : 'demand'}
        onCreated={({ gl: renderer, scene, camera }) => {
          // Warm every render pipeline while the boot screen still covers
          // the canvas — first-use WGSL compilation must not hit the user.
          (renderer as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<unknown> })
            .compileAsync?.(scene, camera)
            ?.catch(() => {});
        }}
      >
        <DprGovernor
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
