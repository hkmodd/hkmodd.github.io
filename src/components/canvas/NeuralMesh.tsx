import { useMemo, useRef, useCallback, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useAppStore } from '@/store/useAppStore';
import { useNeuralEngine, NODE_COUNT, MAX_CONNECTIONS, PULSE_COUNT } from '@/hooks/useNeuralEngine';
import type { NeuralEngine } from '@/wasm/pkg/neural_engine';
import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════════
   NEURAL MESH v3 — Rust WASM-powered simulation
   GPU shaders stay, JS loops replaced with Rust for near-native perf
   ═════════════════════════════════════════════════════════════════ */

const FIELD_SIZE = 20;

// ── Helpers ────────────────────────────────────────────────────────
const tmpColor = new THREE.Color();
const tmpVec3  = new THREE.Vector3();

// ═══════════════════════════════════════════════════════════════════
//  NODE MESH - reads positions/opacities/sizes from WASM memory
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
  varying float vOpacity;
  varying float vDist;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    // Soft glow falloff - brighter core, softer edge
    float core = smoothstep(0.5, 0.0, d);
    float glow = exp(-d * 4.0) * 0.8;
    float alpha = (core + glow) * vOpacity;

    // Depth-based fog
    float fog = smoothstep(25.0, 5.0, vDist);
    alpha *= fog;

    gl_FragColor = vec4(uColor * (1.0 + glow * 0.5), alpha);
  }
`;

interface WasmChildProps {
  engine: NeuralEngine;
  memory: WebAssembly.Memory;
}

function WasmNodes({ engine, memory }: WasmChildProps) {
  const pointsRef = useRef<THREE.Points>(null!);
  // Cache WASM buffer views — only recreate if buffer detaches (memory.grow)
  const viewCache = useRef<{ buf: ArrayBuffer; pos: Float32Array; opac: Float32Array; size: Float32Array } | null>(null);

  const { posAttr, opacAttr, sizeAttr } = useMemo(() => {
    const posArr = new Float32Array(NODE_COUNT * 3);
    const opacArr = new Float32Array(NODE_COUNT);
    const sizeArr = new Float32Array(NODE_COUNT);
    const posAttr = new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage);
    const opacAttr = new THREE.BufferAttribute(opacArr, 1).setUsage(THREE.DynamicDrawUsage);
    const sizeAttr = new THREE.BufferAttribute(sizeArr, 1).setUsage(THREE.DynamicDrawUsage);
    return { posAttr, opacAttr, sizeAttr };
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', posAttr);
    g.setAttribute('aOpacity', opacAttr);
    g.setAttribute('aSize', sizeAttr);
    return g;
  }, [posAttr, opacAttr, sizeAttr]);

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color('#00d4ff') },
  }), []);

  useFrame(() => {
    const wasmBuf = memory.buffer;
    const cache = viewCache.current;

    // Only create new Float32Array views when buffer detaches
    if (!cache || cache.buf !== wasmBuf) {
      viewCache.current = {
        buf: wasmBuf,
        pos: new Float32Array(wasmBuf, engine.positions_ptr(), engine.positions_len()),
        opac: new Float32Array(wasmBuf, engine.opacities_ptr(), engine.opacities_len()),
        size: new Float32Array(wasmBuf, engine.sizes_ptr(), engine.sizes_len()),
      };
    }
    const views = viewCache.current!;

    // Copy into Three.js attributes
    (posAttr.array as Float32Array).set(views.pos);
    (opacAttr.array as Float32Array).set(views.opac);
    (sizeAttr.array as Float32Array).set(views.size);

    posAttr.needsUpdate = true;
    opacAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;

    // Sync color
    uniforms.uColor.value.setRGB(engine.color_r(), engine.color_g(), engine.color_b());
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={nodeVertexShader}
        fragmentShader={nodeFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  CONNECTION LINES - reads WASM conn buffers
// ═══════════════════════════════════════════════════════════════════

function WasmConnections({ engine, memory }: WasmChildProps) {
  const linesRef = useRef<THREE.LineSegments>(null!);
  const viewCache = useRef<{ buf: ArrayBuffer; pos: Float32Array; col: Float32Array } | null>(null);

  const { posAttr, colAttr } = useMemo(() => {
    const posArr = new Float32Array(MAX_CONNECTIONS * 6);
    const colArr = new Float32Array(MAX_CONNECTIONS * 6);
    const posAttr = new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(colArr, 3).setUsage(THREE.DynamicDrawUsage);
    return { posAttr, colAttr };
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', posAttr);
    g.setAttribute('color', colAttr);
    return g;
  }, [posAttr, colAttr]);

  useFrame(() => {
    const wasmBuf = memory.buffer;
    const cache = viewCache.current;

    if (!cache || cache.buf !== wasmBuf) {
      viewCache.current = {
        buf: wasmBuf,
        pos: new Float32Array(wasmBuf, engine.conn_positions_ptr(), engine.conn_positions_len()),
        col: new Float32Array(wasmBuf, engine.conn_colors_ptr(), engine.conn_colors_len()),
      };
    }
    const views = viewCache.current!;
    const count = engine.conn_count();

    (posAttr.array as Float32Array).set(views.pos);
    (colAttr.array as Float32Array).set(views.col);

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
  });

  return (
    <lineSegments ref={linesRef} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  PULSE PARTICLES - instanced spheres from WASM matrices
// ═══════════════════════════════════════════════════════════════════

function WasmPulses({ engine, memory }: WasmChildProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const viewCache = useRef<{ buf: ArrayBuffer; mat: Float32Array } | null>(null);
  const prevColorKey = useRef('');

  const geo = useMemo(() => new THREE.SphereGeometry(0.04, 3, 3), []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({
      toneMapped: false,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    }),
    []
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const wasmBuf = memory.buffer;
    const cache = viewCache.current;

    if (!cache || cache.buf !== wasmBuf) {
      viewCache.current = {
        buf: wasmBuf,
        mat: new Float32Array(wasmBuf, engine.pulse_matrices_ptr(), engine.pulse_matrices_len()),
      };
    }

    // Write matrices directly into instanceMatrix.array
    const instanceArr = mesh.instanceMatrix.array as Float32Array;
    instanceArr.set(viewCache.current!.mat);
    mesh.instanceMatrix.needsUpdate = true;

    // Only update colors when they actually change
    const r = engine.color_r();
    const g = engine.color_g();
    const b = engine.color_b();
    const colorKey = `${(r * 100) | 0},${(g * 100) | 0},${(b * 100) | 0}`;
    if (colorKey !== prevColorKey.current) {
      prevColorKey.current = colorKey;
      tmpColor.setRGB(r * 2.0, g * 2.0, b * 2.0);
      for (let i = 0; i < PULSE_COUNT; i++) {
        mesh.setColorAt(i, tmpColor);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, PULSE_COUNT]} frustumCulled={false} />
  );
}

// ═══════════════════════════════════════════════════════════════════
//  PERSPECTIVE GRID - shader-based (stays as-is, already GPU)
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

    gl_FragColor = vec4(uColor, alpha);
  }
`;

function PerspectiveGrid({ pointerRef }: { pointerRef: React.MutableRefObject<THREE.Vector3> }) {
  const shaderRef = useRef<THREE.ShaderMaterial>(null!);
  const colorRef = useRef(new THREE.Color('#00d4ff'));

  useFrame(({ clock }) => {
    if (!shaderRef.current) return;
    // Read store inside frame loop — avoids React re-render on theme change
    const theme = useAppStore.getState().theme;
    const targetColor = theme === 'redteam' ? '#ff0033' : '#00d4ff';
    colorRef.current.lerp(tmpColor.set(targetColor), 0.04);
    shaderRef.current.uniforms.uColor.value.copy(colorRef.current);
    shaderRef.current.uniforms.uTime.value = clock.getElapsedTime();

    const p = pointerRef.current;
    shaderRef.current.uniforms.uPointer.value.set(p.x / 60, p.y / 60);
  });

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#00d4ff') },
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
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
//  VOLUMETRIC FOG PLANE
// ═══════════════════════════════════════════════════════════════════

function DepthFog() {
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);
  const colorRef = useRef(new THREE.Color('#000814'));

  useFrame(() => {
    if (!matRef.current) return;
    // Read store inside frame loop — avoids React re-render on theme change
    const theme = useAppStore.getState().theme;
    const targetColor = theme === 'redteam' ? '#0a0002' : '#000814';
    colorRef.current.lerp(tmpColor.set(targetColor), 0.03);
    matRef.current.color.copy(colorRef.current);
  });

  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[80, 80]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        opacity={0.6}
        color="#000814"
        depthWrite={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  SCENE - orchestrates WASM tick + Three.js rendering
// ═══════════════════════════════════════════════════════════════════

function NeuralMeshScene() {
  const pointerRef = useRef(new THREE.Vector3(999, 999, 0));
  const groupRef = useRef<THREE.Group>(null!);
  const { engine, memory, isReady } = useNeuralEngine();

  const handlePointerMove = useCallback(
    (e: THREE.Event & { point: THREE.Vector3 }) => {
      pointerRef.current.copy(e.point);
    },
    []
  );

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // Slow rotation
    const t = clock.getElapsedTime();
    group.rotation.y = t * 0.015;
    group.rotation.x = Math.sin(t * 0.04) * 0.04;

    // ── WASM tick — all per-frame math runs here ──
    if (engine) {
      // Read store inside frame loop — avoids reactive re-renders
      const { theme, redTeamTransitioning } = useAppStore.getState();
      const targetColor = theme === 'redteam' ? '#ff0033' : '#00d4ff';
      tmpColor.set(targetColor);

      engine.tick(
        delta,
        pointerRef.current.x,
        pointerRef.current.y,
        pointerRef.current.z,
        tmpColor.r,
        tmpColor.g,
        tmpColor.b,
        redTeamTransitioning,
      );
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

      {/* Perspective grid (beneath neural mesh) */}
      <PerspectiveGrid pointerRef={pointerRef} />

      {/* Neural network group with parallax */}
      <group ref={groupRef}>
        {isReady && engine && memory && (
          <>
            <WasmNodes engine={engine} memory={memory} />
            <WasmConnections engine={engine} memory={memory} />
            <WasmPulses engine={engine} memory={memory} />
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

  // ── Scroll-synced fade ──
  useEffect(() => {
    let rafId = 0;
    let ticking = false;

    const applyScroll = () => {
      const el = wrapperRef.current;
      if (!el) return;

      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const progress = Math.min(scrollY / vh, 1);
      const t = Math.min(progress / 0.7, 1);
      const opacity = 0.8 * (1 - t);
      const yShift = t * -120;

      el.style.opacity = String(Math.max(opacity, 0));
      el.style.transform = `translateY(${yShift}px)`;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        rafId = requestAnimationFrame(applyScroll);
        ticking = true;
      }
    };

    applyScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

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
        dpr={[1, 1.5]}
        flat
        performance={{ min: 0.5 }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        style={{ background: 'transparent', pointerEvents: 'auto' }}
        frameloop="always"
      >
        <NeuralMeshScene />
      </Canvas>
    </div>
  );
}
