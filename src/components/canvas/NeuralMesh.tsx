import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '@/store/useAppStore';
import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════════
   NEURAL MESH v2 — Deep, immersive, interactive cyber-topology
   ═════════════════════════════════════════════════════════════════ */

// ── Performance tiers ──────────────────────────────────────────────
const isMobile =
  typeof window !== 'undefined' &&
  (window.innerWidth <= 768 ||
    ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) < 4);

const NODE_COUNT = isMobile ? 250 : 700;
const MAX_CONNECTIONS = isMobile ? 700 : 2000;
const CONNECTION_DIST = isMobile ? 2.6 : 2.4;
const PULSE_COUNT = isMobile ? 16 : 40;
const FIELD_SIZE = isMobile ? 16 : 20;

// ── Depth configuration — 3 discrete z-planes for parallax ────────
const DEPTH_LAYERS = [
  { z: -8, count: 0.25, scale: 0.5, opacity: 0.3 },  // far — dim, small
  { z: -3, count: 0.45, scale: 0.8, opacity: 0.6 },  // mid — medium
  { z: 2,  count: 0.30, scale: 1.2, opacity: 1.0 },  // near — bright, large
];

// ── Helpers ────────────────────────────────────────────────────────
const tmpColor = new THREE.Color();
const tmpVec3 = new THREE.Vector3();
const tmpVec3b = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();
const tmpObj = new THREE.Object3D();

// ═══════════════════════════════════════════════════════════════════
//  NODE MESH — layered depth with glow + pointer repulsion
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

    // Soft glow falloff — brighter core, softer edge
    float core = smoothstep(0.5, 0.0, d);
    float glow = exp(-d * 4.0) * 0.8;
    float alpha = (core + glow) * vOpacity;

    // Depth-based fog
    float fog = smoothstep(25.0, 5.0, vDist);
    alpha *= fog;

    gl_FragColor = vec4(uColor * (1.0 + glow * 0.5), alpha);
  }
`;

function Nodes({ pointerRef }: { pointerRef: React.MutableRefObject<THREE.Vector3> }) {
  const theme = useAppStore((s) => s.theme);
  const transitioning = useAppStore((s) => s.redTeamTransitioning);
  const pointsRef = useRef<THREE.Points>(null!);

  const nodeData = useMemo(() => {
    const positions = new Float32Array(NODE_COUNT * 3);
    const opacities = new Float32Array(NODE_COUNT);
    const sizes = new Float32Array(NODE_COUNT);
    const phases = new Float32Array(NODE_COUNT);
    const speeds = new Float32Array(NODE_COUNT);
    const layers = new Uint8Array(NODE_COUNT); // which depth layer

    let idx = 0;
    for (let l = 0; l < DEPTH_LAYERS.length; l++) {
      const layer = DEPTH_LAYERS[l];
      const layerCount = Math.floor(NODE_COUNT * layer.count);
      for (let i = 0; i < layerCount && idx < NODE_COUNT; i++, idx++) {
        positions[idx * 3] = (Math.random() - 0.5) * FIELD_SIZE;
        positions[idx * 3 + 1] = (Math.random() - 0.5) * FIELD_SIZE;
        positions[idx * 3 + 2] = layer.z + (Math.random() - 0.5) * 4;
        opacities[idx] = layer.opacity;
        sizes[idx] = layer.scale;
        phases[idx] = Math.random() * Math.PI * 2;
        speeds[idx] = 0.2 + Math.random() * 0.8;
        layers[idx] = l;
      }
    }
    // Fill remaining
    while (idx < NODE_COUNT) {
      positions[idx * 3] = (Math.random() - 0.5) * FIELD_SIZE;
      positions[idx * 3 + 1] = (Math.random() - 0.5) * FIELD_SIZE;
      positions[idx * 3 + 2] = (Math.random() - 0.5) * 10;
      opacities[idx] = 0.5;
      sizes[idx] = 0.7;
      phases[idx] = Math.random() * Math.PI * 2;
      speeds[idx] = 0.3 + Math.random() * 0.7;
      layers[idx] = 1;
      idx++;
    }

    return { positions, opacities, sizes, phases, speeds, layers };
  }, []);

  // Working copy of positions (mutated each frame)
  const livePositions = useMemo(() => new Float32Array(nodeData.positions), [nodeData]);
  const liveOpacities = useMemo(() => new Float32Array(nodeData.opacities), [nodeData]);
  const liveSizes = useMemo(() => new Float32Array(nodeData.sizes), [nodeData]);

  const colorRef = useRef(new THREE.Color('#00d4ff'));

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(livePositions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aOpacity', new THREE.BufferAttribute(liveOpacities, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(liveSizes, 1).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [livePositions, liveOpacities, liveSizes]);

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color('#00d4ff') },
  }), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pts = pointsRef.current;
    if (!pts) return;

    const targetColor = theme === 'redteam' ? '#ff0033' : '#00d4ff';
    colorRef.current.lerp(tmpColor.set(targetColor), 0.04);
    uniforms.uColor.value.copy(colorRef.current);

    const pointer = pointerRef.current;
    const speedBurst = transitioning ? 4.0 : 1.0;

    // Breathing rhythm — slow global pulse
    const breathe = Math.sin(t * 0.4) * 0.15;

    for (let i = 0; i < NODE_COUNT; i++) {
      const i3 = i * 3;
      const baseX = nodeData.positions[i3];
      const baseY = nodeData.positions[i3 + 1];
      const baseZ = nodeData.positions[i3 + 2];
      const phase = nodeData.phases[i];
      const speed = nodeData.speeds[i];

      // Lissajous drift + breathing
      let x = baseX + Math.sin(t * 0.15 * speed + phase) * 0.5 * speedBurst;
      let y = baseY + Math.cos(t * 0.12 * speed + phase * 1.3) * 0.5 * speedBurst;
      let z = baseZ + Math.sin(t * 0.1 * speed + phase * 0.7) * 0.3 + breathe;

      // ── Pointer repulsion (interactive!) ──
      tmpVec3.set(x, y, z);
      const dist = tmpVec3.distanceTo(pointer);
      if (dist < 3.5) {
        const force = Math.pow(1 - dist / 3.5, 2) * 1.8;
        const dir = tmpVec3.sub(pointer).normalize().multiplyScalar(force);
        x += dir.x;
        y += dir.y;
        z += dir.z * 0.3; // less z-push
      }

      livePositions[i3] = x;
      livePositions[i3 + 1] = y;
      livePositions[i3 + 2] = z;

      // Proximity brightness boost
      const pDist = tmpVec3b.set(x, y, z).distanceTo(pointer);
      const proximity = Math.max(0, 1 - pDist / 5);
      liveOpacities[i] = nodeData.opacities[i] + proximity * 0.5;
      liveSizes[i] = nodeData.sizes[i] * (1 + proximity * 0.6);
    }

    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.aOpacity as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
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
//  CONNECTION LINES — depth-faded, pointer-reactive
// ═══════════════════════════════════════════════════════════════════

function Connections({ pointerRef }: { pointerRef: React.MutableRefObject<THREE.Vector3> }) {
  const theme = useAppStore((s) => s.theme);
  const transitioning = useAppStore((s) => s.redTeamTransitioning);
  const linesRef = useRef<THREE.LineSegments>(null!);

  const { posAttr, colAttr } = useMemo(() => {
    const posArr = new Float32Array(MAX_CONNECTIONS * 6);
    const colArr = new Float32Array(MAX_CONNECTIONS * 6);
    const posAttr = new THREE.BufferAttribute(posArr, 3);
    const colAttr = new THREE.BufferAttribute(colArr, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    return { posAttr, colAttr };
  }, []);

  const colorRef = useRef(new THREE.Color('#00d4ff'));

  useFrame(() => {
    const lines = linesRef.current;
    if (!lines) return;

    const targetColor = theme === 'redteam' ? '#ff0033' : '#00d4ff';
    colorRef.current.lerp(tmpColor.set(targetColor), 0.04);

    // Read live node positions from sibling Points geometry
    const parent = lines.parent;
    if (!parent) return;
    const pointsMesh = parent.children.find(
      (c) => (c as THREE.Points).isPoints
    ) as THREE.Points | undefined;
    if (!pointsMesh) return;

    const nodePos = (pointsMesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    const pointer = pointerRef.current;

    let lineIdx = 0;
    const connDist = CONNECTION_DIST;
    const stride = isMobile ? 2 : 1; // skip every 2nd node on mobile for O(n²/2)

    for (let i = 0; i < NODE_COUNT && lineIdx < MAX_CONNECTIONS; i += stride) {
      const ax = nodePos[i * 3], ay = nodePos[i * 3 + 1], az = nodePos[i * 3 + 2];
      for (let j = i + 1; j < NODE_COUNT && lineIdx < MAX_CONNECTIONS; j++) {
        const bx = nodePos[j * 3], by = nodePos[j * 3 + 1], bz = nodePos[j * 3 + 2];
        // ── Spatial early-exit: skip if ANY axis delta exceeds threshold ──
        const dx = ax - bx;
        if (dx > connDist || dx < -connDist) continue;
        const dy = ay - by;
        if (dy > connDist || dy < -connDist) continue;
        const dz = az - bz;
        if (dz > connDist || dz < -connDist) continue;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (d < CONNECTION_DIST) {
          const alpha = 1 - d / CONNECTION_DIST;
          const midX = (ax + bx) / 2, midY = (ay + by) / 2;
          const pDist = Math.sqrt((midX - pointer.x) ** 2 + (midY - pointer.y) ** 2);
          const proximity = Math.max(0, 1 - pDist / 4);

          // Near pointer → lines glow bright (interactive pulse)
          const brightness = (alpha * 0.25 + proximity * 0.8) * (transitioning ? 2 : 1);

          // Depth fog for connections
          const avgZ = (az + bz) / 2;
          const depthFog = THREE.MathUtils.smoothstep(avgZ, -10, 4);

          const finalBright = brightness * (0.3 + depthFog * 0.7);

          const i6 = lineIdx * 6;
          posArr[i6] = ax; posArr[i6 + 1] = ay; posArr[i6 + 2] = az;
          posArr[i6 + 3] = bx; posArr[i6 + 4] = by; posArr[i6 + 5] = bz;

          const r = colorRef.current.r * finalBright;
          const g = colorRef.current.g * finalBright;
          const bl = colorRef.current.b * finalBright;
          colArr[i6] = r; colArr[i6 + 1] = g; colArr[i6 + 2] = bl;
          colArr[i6 + 3] = r; colArr[i6 + 4] = g; colArr[i6 + 5] = bl;

          lineIdx++;
        }
      }
    }

    for (let i = lineIdx * 6; i < MAX_CONNECTIONS * 6; i++) {
      posArr[i] = 0; colArr[i] = 0;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    lines.geometry.setDrawRange(0, lineIdx * 2);
  });

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', posAttr);
    g.setAttribute('color', colAttr);
    return g;
  }, [posAttr, colAttr]);

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
//  PULSE PARTICLES — data packets traversing the network
// ═══════════════════════════════════════════════════════════════════

function Pulses({ pointerRef: _pointerRef }: { pointerRef: React.MutableRefObject<THREE.Vector3> }) {
  const theme = useAppStore((s) => s.theme);
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  const pulseData = useMemo(() => {
    const data = [];
    for (let i = 0; i < PULSE_COUNT; i++) {
      data.push({
        fromIdx: Math.floor(Math.random() * NODE_COUNT),
        toIdx: Math.floor(Math.random() * NODE_COUNT),
        progress: Math.random(),
        speed: 0.15 + Math.random() * 0.5,
      });
    }
    return data;
  }, []);

  const colorRef = useRef(new THREE.Color('#00d4ff'));

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const targetColor = theme === 'redteam' ? '#ff0033' : '#00d4ff';
    colorRef.current.lerp(tmpColor.set(targetColor), 0.04);

    // Read node positions from sibling Points
    const parent = mesh.parent;
    if (!parent) return;
    const pointsMesh = parent.children.find(
      (c) => (c as THREE.Points).isPoints
    ) as THREE.Points | undefined;
    if (!pointsMesh) return;

    const nodePos = (pointsMesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;

    for (let i = 0; i < PULSE_COUNT; i++) {
      const pulse = pulseData[i];
      pulse.progress += delta * pulse.speed;

      if (pulse.progress >= 1) {
        pulse.fromIdx = pulse.toIdx;
        pulse.toIdx = Math.floor(Math.random() * NODE_COUNT);
        pulse.progress = 0;
        pulse.speed = 0.15 + Math.random() * 0.5;
      }

      const fi = pulse.fromIdx * 3, ti = pulse.toIdx * 3;
      const fx = nodePos[fi], fy = nodePos[fi + 1], fz = nodePos[fi + 2];
      const tx = nodePos[ti], ty = nodePos[ti + 1], tz = nodePos[ti + 2];
      const p = pulse.progress;

      tmpObj.position.set(
        fx + (tx - fx) * p,
        fy + (ty - fy) * p,
        fz + (tz - fz) * p + Math.sin(p * Math.PI) * 0.4,
      );

      const s = 0.6 + Math.sin(p * Math.PI) * 0.6;
      tmpObj.scale.setScalar(s);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);

      tmpColor.copy(colorRef.current).multiplyScalar(2.0);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const geo = useMemo(() => new THREE.SphereGeometry(0.04, 3, 3), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, PULSE_COUNT]} frustumCulled={false} />
  );
}

// ═══════════════════════════════════════════════════════════════════
//  PERSPECTIVE GRID — reactive cyber-floor with pointer warping
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
  const theme = useAppStore((s) => s.theme);
  const shaderRef = useRef<THREE.ShaderMaterial>(null!);
  const colorRef = useRef(new THREE.Color('#00d4ff'));

  useFrame(({ clock }) => {
    if (!shaderRef.current) return;
    const targetColor = theme === 'redteam' ? '#ff0033' : '#00d4ff';
    colorRef.current.lerp(tmpColor.set(targetColor), 0.04);
    shaderRef.current.uniforms.uColor.value.copy(colorRef.current);
    shaderRef.current.uniforms.uTime.value = clock.getElapsedTime();

    // Map 3D pointer to grid UV space (approximate)
    const p = pointerRef.current;
    shaderRef.current.uniforms.uPointer.value.set(
      p.x / 60,  // grid is 60 units wide
      p.y / 60
    );
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
      <planeGeometry args={[60, 60, isMobile ? 16 : 32, isMobile ? 16 : 32]} />
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
//  VOLUMETRIC FOG PLANES — depth atmosphere layers
// ═══════════════════════════════════════════════════════════════════

function DepthFog() {
  const theme = useAppStore((s) => s.theme);
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);
  const colorRef = useRef(new THREE.Color('#000814'));

  useFrame(() => {
    if (!matRef.current) return;
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
//  SCENE — orchestrates all + pointer + scroll parallax
// ═══════════════════════════════════════════════════════════════════

function NeuralMeshScene() {
  const pointerRef = useRef(new THREE.Vector3(999, 999, 0));
  const groupRef = useRef<THREE.Group>(null!);
  const { viewport: _viewport } = useThree();

  const handlePointerMove = useCallback(
    (e: THREE.Event & { point: THREE.Vector3 }) => {
      pointerRef.current.copy(e.point);
    },
    []
  );

  // Slow rotation only (no scroll parallax — Hero is fixed, bg must stay in sync)
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime();
    group.rotation.y = t * 0.015;
    group.rotation.x = Math.sin(t * 0.04) * 0.04;
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
        <Nodes pointerRef={pointerRef} />
        <Connections pointerRef={pointerRef} />
        <Pulses pointerRef={pointerRef} />
      </group>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  EXPORT — Canvas with depth-aware camera settings
// ═══════════════════════════════════════════════════════════════════

export default function NeuralMesh() {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Scroll-synced fade — matches Hero's scroll transforms exactly ──
  // Hero uses scrollYProgress [0, 0.7] → opacity [1, 0], y [0, -80], scale [1, 0.95]
  // We replicate the same curve here by reading window.scrollY directly.
  useEffect(() => {
    let rafId = 0;
    const update = () => {
      const el = wrapperRef.current;
      if (!el) { rafId = requestAnimationFrame(update); return; }

      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      // scrollYProgress equivalent: 0 when at top, 1 when scrolled past one viewport
      const progress = Math.min(scrollY / vh, 1);

      // Match Hero's [0, 0.7] range mapping
      const t = Math.min(progress / 0.7, 1); // 0→1 over 70% of scroll
      const opacity = 0.8 * (1 - t); // 0.8 base dimming × scroll fade
      const yShift = t * -120; // slide up (no scale — scale causes desktop shrink bug)

      el.style.opacity = String(Math.max(opacity, 0));
      el.style.transform = `translateY(${yShift}px)`;

      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-0 pointer-events-none will-change-transform"
    >
      <Canvas
        camera={{
          position: [0, 0, isMobile ? 12 : 10],
          fov: isMobile ? 65 : 55,
          near: 0.1,
          far: 50,
        }}
        dpr={isMobile ? [1, 1.5] : [1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: isMobile ? 'low-power' : 'high-performance',
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

