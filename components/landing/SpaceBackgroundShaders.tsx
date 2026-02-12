'use client';

/**
 * Space Background with Shaders
 * Features:
 * - Nebula effect
 * - Floating particles
 * - Stars
 * - Black hole depth effect
 * - Parallax on mouse movement
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '@/lib/design/tokens';

function ParticleField() {
  const particles = useRef<THREE.Points>(null);
  const particlesData = useMemo(() => {
    const count = 1000;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 100;
      positions[i + 1] = (Math.random() - 0.5) * 100;
      positions[i + 2] = (Math.random() - 0.5) * 100;

      velocities[i] = (Math.random() - 0.5) * 0.2;
      velocities[i + 1] = (Math.random() - 0.5) * 0.2;
      velocities[i + 2] = (Math.random() - 0.5) * 0.2;
    }

    return { positions, velocities };
  }, []);

  useFrame(() => {
    if (!particles.current) return;

    const positions = particlesData.positions;
    const velocities = particlesData.velocities;

    for (let i = 0; i < positions.length; i += 3) {
      const vx = velocities[i] ?? 0;
      const vy = velocities[i + 1] ?? 0;
      const vz = velocities[i + 2] ?? 0;

      const posX = (positions[i] ?? 0) + vx;
      const posY = (positions[i + 1] ?? 0) + vy;
      const posZ = (positions[i + 2] ?? 0) + vz;

      positions[i] = posX;
      positions[i + 1] = posY;
      positions[i + 2] = posZ;

      // Wrap around
      positions[i] = Math.abs(posX) > 50 ? posX * -1 : posX;
      positions[i + 1] = Math.abs(posY) > 50 ? posY * -1 : posY;
      positions[i + 2] = Math.abs(posZ) > 50 ? posZ * -1 : posZ;
    }

    const positionAttr = particles.current.geometry.getAttribute('position');
    if (positionAttr) {
      positionAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={particles}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particlesData.positions.length / 3}
          array={particlesData.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        color={colors.primary.from}
        sizeAttenuation
        transparent
        opacity={0.6}
      />
    </points>
  );
}

function StarField() {
  const stars = useMemo(() => {
    const starCount = 500;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      const distance = 50 + Math.random() * 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i] = distance * Math.sin(phi) * Math.cos(theta);
      positions[i + 1] = distance * Math.sin(phi) * Math.sin(theta);
      positions[i + 2] = distance * Math.cos(phi);
    }

    return positions;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={stars.length / 3}
          array={stars}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.3} color="#FFFFFF" sizeAttenuation transparent opacity={0.8} />
    </points>
  );
}

function NebulaBackground() {
  const meshRef = useRef<THREE.Mesh>(null);

  const vertexShader = `
    varying vec3 vPosition;
    varying vec3 vNormal;

    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    varying vec3 vPosition;
    varying vec3 vNormal;

    vec3 palette(float t) {
      vec3 a = vec3(0.5, 0.5, 0.5);
      vec3 b = vec3(0.5, 0.5, 0.5);
      vec3 c = vec3(2.0, 1.0, 0.0);
      vec3 d = vec3(5.23, 5.30, 5.1);

      return a + b * cos(6.28318 * (c * t + d));
    }

    void main() {
      vec3 col = vec3(0.0);
      vec3 pos = vPosition * 0.2;

      // Cloud-like nebula
      float n = sin(pos.x * 3.0 + uTime * 0.1) *
                cos(pos.y * 2.0 - uTime * 0.15) *
                sin(pos.z * 1.5 + uTime * 0.2);

      col += palette(n + uTime * 0.05) * 0.5;

      // Add depth effect (black hole)
      float depth = length(vPosition) * 0.05;
      col *= smoothstep(1.0, 0.0, depth);

      gl_FragColor = vec4(col, 0.3);
    }
  `;

  useFrame((state) => {
    if (meshRef.current && meshRef.current.material instanceof THREE.ShaderMaterial) {
      const { uniforms } = meshRef.current.material;
      if (uniforms?.uTime) {
        uniforms.uTime.value = state.clock.elapsedTime;
      }
    }
  });

  return (
    <mesh ref={meshRef} scale={100}>
      <sphereGeometry args={[1, 32, 32]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 },
        }}
        side={THREE.BackSide}
        transparent
      />
    </mesh>
  );
}

export default function SpaceBackgroundShaders() {
  return (
    <group>
      {/* Nebula shader background */}
      <NebulaBackground />

      {/* Ambient particles */}
      <ParticleField />

      {/* Distant stars */}
      <StarField />

      {/* Fog for depth */}
      <fog attach="fog" args={['#05070A', 5, 100]} />
    </group>
  );
}
