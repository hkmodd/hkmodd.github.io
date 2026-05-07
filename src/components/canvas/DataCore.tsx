import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Wireframe, Sphere, Icosahedron } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '@/store/useAppStore';

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

  useFrame((state, delta) => {
    if (outerRef.current && innerRef.current) {
      // Rotate
      const speed = isHovered ? 2.5 : 0.5;
      outerRef.current.rotation.y += delta * speed;
      outerRef.current.rotation.x += delta * (speed * 0.5);
      
      innerRef.current.rotation.y -= delta * (speed * 1.5);
      innerRef.current.rotation.z += delta * speed;

      // Scale pulse
      const targetScale = isHovered ? 1.2 : 1.0;
      outerRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
      
      const innerScale = isHovered ? 1.0 + Math.sin(state.clock.elapsedTime * 10) * 0.1 : 0.8;
      innerRef.current.scale.lerp(new THREE.Vector3(innerScale, innerScale, innerScale), 0.2);
    }
  });

  return (
    <group>
      {/* Outer Wireframe Icosahedron */}
      <Icosahedron ref={outerRef} args={[1, 1]}>
        <meshBasicMaterial color={targetColor} wireframe transparent opacity={0.3} />
      </Icosahedron>

      {/* Inner solid glowing sphere */}
      <Sphere ref={innerRef} args={[0.6, 32, 32]}>
        <meshBasicMaterial color={targetColor} transparent opacity={0.8} />
      </Sphere>

      {/* Point light to cast a glow */}
      <pointLight color={targetColor} intensity={isHovered ? 4 : 1} distance={5} />
    </group>
  );
}

export default function DataCore() {
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useAppStore((s) => s.reducedMotion);

  if (reducedMotion) return null;

  return (
    <div 
      className="w-full h-64 sm:h-80 relative cursor-crosshair"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        <Float speed={hovered ? 4 : 2} rotationIntensity={0.5} floatIntensity={1}>
          <CoreMesh isHovered={hovered} />
        </Float>
      </Canvas>
    </div>
  );
}
