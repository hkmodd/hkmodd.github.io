import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sphere, Icosahedron } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '@/store/useAppStore';

// Reusable scratch vector — avoids a per-frame THREE.Vector3 allocation in the
// scale lerp below (mirrors the zero-alloc discipline already used in NeuralMesh).
const _scratchScale = new THREE.Vector3();

// ── Plasma-core shaders for the DataCore inner sphere ──────────────
// Fresnel rim (hot energy edge) + layered-sine interior shimmer. The bloom
// is still faked by the additive halo spheres — zero post-processing passes.
const coreVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    vPos = position;
    gl_Position = projectionMatrix * mv;
  }
`;

const coreFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;

  void main() {
    // Fresnel: bright energy edge, softer interior
    float ndv = max(dot(normalize(vNormal), normalize(vView)), 0.0);
    float fres = pow(1.0 - ndv, 2.0);

    // Layered sines → shimmering "plasma" interior
    float e  = sin(uTime * 2.5 + vPos.y * 5.0) * 0.5 + 0.5;
    e *= sin(uTime * 1.7 + vPos.x * 4.0) * 0.5 + 0.5;

    vec3 interior = uColor * (0.35 + e * 0.55);
    vec3 rim      = uColor * (1.8 + fres * 2.2);
    vec3 col = mix(interior, rim, fres);

    float alpha = (0.6 + fres * 0.4) * uIntensity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

function CoreMesh({ isHovered }: { isHovered: boolean }) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const theme = useAppStore((s) => s.theme);
  
  const colors = useMemo(() => {
    return {
      redteam: new THREE.Color('#ff0033'),
      light: new THREE.Color('#0066cc'),
      default: new THREE.Color('#00d4ff'),
    };
  }, []);

  const targetColor = colors[theme] || colors.default;

  // Plasma-core shader uniforms (stable object — mutated in place each frame).
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#00d4ff') },
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (outerRef.current && innerRef.current) {
      // Rotate
      const speed = isHovered ? 2.5 : 0.5;
      outerRef.current.rotation.y += delta * speed;
      outerRef.current.rotation.x += delta * (speed * 0.5);

      innerRef.current.rotation.y -= delta * (speed * 1.5);
      innerRef.current.rotation.z += delta * speed;

      // Scale pulse — reuse the scratch vector instead of allocating two
      // THREE.Vector3 every frame.
      const targetScale = isHovered ? 1.2 : 1.0;
      outerRef.current.scale.lerp(_scratchScale.set(targetScale, targetScale, targetScale), 0.1);

      const innerScale = isHovered ? 1.0 + Math.sin(state.clock.elapsedTime * 10) * 0.1 : 0.8;
      innerRef.current.scale.lerp(_scratchScale.set(innerScale, innerScale, innerScale), 0.2);
    }

    // ── Plasma core: animate time + smoothly chase the theme color ──
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uColor.value.lerp(targetColor, 0.1);
    const targetIntensity = isHovered ? 1.8 : 1.0;
    uniforms.uIntensity.value += (targetIntensity - uniforms.uIntensity.value) * 0.1;
  });

  return (
    <group>
      {/* Outer Wireframe Icosahedron — the "data cage" */}
      <Icosahedron ref={outerRef} args={[1, 1]}>
        <meshBasicMaterial color={targetColor} wireframe transparent opacity={0.3} />
      </Icosahedron>

      {/* Inner PLASMA CORE — fresnel rim + shimmering energy (custom shader).
          Replaces the old flat meshBasicMaterial ball with something that
          reads as a live energy source, at zero post-processing cost. */}
      <Sphere ref={innerRef} args={[0.6, 32, 32]}>
        <shaderMaterial
          vertexShader={coreVertexShader}
          fragmentShader={coreFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          toneMapped={false}
        />

        {/* Bloom halos — additive spheres, GPU hardware blended (zero pass) */}
        <Sphere args={[1.3, 16, 16]}>
          <meshBasicMaterial color={targetColor} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
        </Sphere>
        <Sphere args={[1.8, 16, 16]}>
          <meshBasicMaterial color={targetColor} transparent opacity={0.05} blending={THREE.AdditiveBlending} depthWrite={false} />
        </Sphere>
      </Sphere>

      {/* Point light to cast a glow */}
      <pointLight color={targetColor} intensity={isHovered ? 4 : 1} distance={5} />
    </group>
  );
}

export default function DataCore() {
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Only run the WebGL render loop while this canvas is actually on-screen.
  // Without this, the second WebGL context renders every frame forever — even
  // while the user is up at the Hero — doubling GPU/CPU cost for nothing.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '120px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (reducedMotion) return null;

  return (
    <div
      ref={wrapRef}
      className="w-full h-64 sm:h-80 relative cursor-crosshair"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Canvas
        camera={{ position: [0, 0, 3], fov: 45 }}
        dpr={[1, 2]}
        // Smooth at native refresh while on-screen; fully stop when scrolled away.
        frameloop={inView ? 'always' : 'never'}
      >
        <Float speed={hovered ? 4 : 2} rotationIntensity={0.5} floatIntensity={1}>
          <CoreMesh isHovered={hovered} />
        </Float>
      </Canvas>
    </div>
  );
}
