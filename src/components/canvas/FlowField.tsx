import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useAppStore } from '@/store/useAppStore';
import * as THREE from 'three';

/**
 * GPU-accelerated particle flow field using Three.js Points + custom shader material.
 * Replaces the original canvas 2D flow field with proper 3D depth and post-processing.
 */

const isMobile = typeof window !== 'undefined' && (
  window.innerWidth <= 768 || (navigator as { deviceMemory?: number }).deviceMemory !== undefined && ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) < 4
);
const PARTICLE_COUNT = isMobile ? 1500 : 3000;

function Particles() {
  const theme = useAppStore((s) => s.theme);
  const transitioning = useAppStore((s) => s.redTeamTransitioning);
  const ref = useRef<THREE.Points>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      velocities[i * 3] = (Math.random() - 0.5) * 0.01;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
    }
    return { positions, velocities };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#00d4ff') },
      uOpacity: { value: 0.6 },
      uSpeedMult: { value: 1.0 },
    }),
    []
  );

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    uniforms.uTime.value = time;

    // Update color based on theme
    const targetColor = theme === 'redteam' ? '#ff0033' : '#00d4ff';
    uniforms.uColor.value.lerp(new THREE.Color(targetColor), 0.05);

    // Speed multiplier — burst during red team transition
    const targetSpeed = transitioning ? 3.0 : 1.0;
    uniforms.uSpeedMult.value += (targetSpeed - uniforms.uSpeedMult.value) * 0.08;

    const geom = ref.current.geometry;
    const pos = geom.attributes.position.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Noise-based flow field
      const x = pos[i3];
      const y = pos[i3 + 1];
      const speedM = uniforms.uSpeedMult.value;
      const noiseX = Math.sin(y * 0.3 + time * 0.2) * 0.002 * speedM;
      const noiseY = Math.cos(x * 0.3 + time * 0.15) * 0.002 * speedM;

      pos[i3] += (velocities[i3] + noiseX) * speedM;
      pos[i3 + 1] += (velocities[i3 + 1] + noiseY) * speedM;
      pos[i3 + 2] += velocities[i3 + 2] * speedM;

      // Wrap around boundaries
      if (pos[i3] > 10) pos[i3] = -10;
      if (pos[i3] < -10) pos[i3] = 10;
      if (pos[i3 + 1] > 10) pos[i3 + 1] = -10;
      if (pos[i3 + 1] < -10) pos[i3 + 1] = 10;
      if (pos[i3 + 2] > 5) pos[i3 + 2] = -5;
      if (pos[i3 + 2] < -5) pos[i3 + 2] = 5;
    }

    geom.attributes.position.needsUpdate = true;
  });

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [positions]);

  return (
    <points ref={ref} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={`
          uniform float uTime;
          varying float vAlpha;

          void main() {
            vec3 pos = position;

            // Subtle pulsation
            float dist = length(pos.xy);
            pos.z += sin(dist * 0.5 + uTime * 0.3) * 0.2;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            // Size attenuation
            float size = 2.0 * (1.0 / -mvPosition.z);
            gl_PointSize = max(size, 0.5);

            // Alpha falloff based on distance
            vAlpha = smoothstep(15.0, 2.0, dist) * 0.8;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vAlpha;

          void main() {
            // Circular point
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;

            float alpha = (1.0 - d * 2.0) * vAlpha * uOpacity;
            gl_FragColor = vec4(uColor, alpha);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function FlowField() {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.7 }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        style={{ background: 'transparent' }}
      >
        <Particles />
      </Canvas>
    </div>
  );
}
