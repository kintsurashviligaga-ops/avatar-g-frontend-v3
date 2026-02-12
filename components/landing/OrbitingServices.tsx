'use client';

/**
 * Orbiting Service Icons
 * 6 services in circular 3D orbits around center avatar
 * Features:
 * - Real 3D orbit mechanics
 * - Glassmorphism rings
 * - Neon circular icons
 * - Hover effects (scale, glow, lift)
 */

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '@/lib/design/tokens';

interface ServiceIcon {
  id: string;
  label: string;
  route: string;
  color: string;
  glowColor: string;
}

const SERVICES: ServiceIcon[] = [
  {
    id: 'avatar-builder',
    label: 'Avatar Builder',
    route: '/services/avatar-builder',
    color: colors.primary.from,
    glowColor: colors.accent.purple,
  },
  {
    id: 'music-studio',
    label: 'Music Studio',
    route: '/services/music-studio',
    color: colors.accent.purple,
    glowColor: colors.accent.pink,
  },
  {
    id: 'video-generator',
    label: 'Video Generator',
    route: '/services/video-generator',
    color: colors.accent.pink,
    glowColor: colors.primary.from,
  },
  {
    id: 'photo-studio',
    label: 'Photo Studio',
    route: '/services/photo-studio',
    color: colors.accent.orange,
    glowColor: colors.accent.red,
  },
  {
    id: 'media-production',
    label: 'Media Production',
    route: '/services/media-production',
    color: colors.accent.red,
    glowColor: colors.accent.orange,
  },
  {
    id: 'ai-chat',
    label: 'AI Chat',
    route: '/services/ai-chat',
    color: colors.primary.from,
    glowColor: colors.accent.purple,
  },
];

const ORBIT_RADIUS = 5;
const ORBIT_HEIGHT = 2;

interface ServiceIconMeshProps {
  service: ServiceIcon;
  index: number;
  onHover: (isHovered: boolean) => void;
}

function ServiceIconMesh({ service, index, onHover }: ServiceIconMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const iconRef = useRef<THREE.Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  useFrame((state) => {
    if (!groupRef.current || !iconRef.current) return;

    const time = state.clock.elapsedTime;

    // Orbit position calculation
    const angle = (time * 0.3) + (index * (Math.PI * 2) / SERVICES.length);
    const x = Math.cos(angle) * ORBIT_RADIUS;
    const z = Math.sin(angle) * ORBIT_RADIUS;
    const y = Math.sin(time * 0.5) * ORBIT_HEIGHT;

    groupRef.current.position.set(x, y, z);

    // Face toward center
    groupRef.current.lookAt(0, 0, 0);

    // Hover animation
    if (isHovered) {
      iconRef.current.scale.lerp(new THREE.Vector3(1.3, 1.3, 1.3), 0.1);
      groupRef.current.position.y += 0.2;
    } else {
      iconRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Glass ring background */}
      <mesh renderOrder={1}>
        <circleGeometry args={[0.6, 32]} />
        <meshPhongMaterial
          color={service.color}
          transparent
          opacity={0.15}
          emissive={service.glowColor}
          emissiveIntensity={isHovered ? 0.8 : 0.3}
        />
      </mesh>

      {/* Icon mesh */}
      <mesh
        ref={iconRef}
        renderOrder={2}
        onPointerEnter={() => {
          setIsHovered(true);
          onHover(true);
        }}
        onPointerLeave={() => {
          setIsHovered(false);
          onHover(false);
        }}
      >
        <octahedronGeometry args={[0.4, 2]} />
        <meshPhongMaterial
          color={service.color}
          emissive={service.glowColor}
          emissiveIntensity={isHovered ? 1 : 0.4}
          shininess={100}
        />
      </mesh>

      {/* Outer ring glow */}
      <mesh renderOrder={0}>
        <torusGeometry args={[0.7, 0.05, 16, 100]} />
        <meshBasicMaterial
          color={service.glowColor}
          transparent
          opacity={isHovered ? 0.8 : 0.3}
        />
      </mesh>
    </group>
  );
}

export default function OrbitingServices() {
  return (
    <group>
      {SERVICES.map((service, index) => (
        <ServiceIconMesh
          key={service.id}
          service={service}
          index={index}
          onHover={() => {}}
        />
      ))}
    </group>
  );
}
