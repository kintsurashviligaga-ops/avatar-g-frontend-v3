'use client';

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';

type WebGLStatus = 'checking' | 'enabled' | 'disabled';

function detectWebGLSupport(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const attributes: WebGLContextAttributes = {
      antialias: false,
      alpha: true,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: true,
    };

    const gl =
      canvas.getContext('webgl2', attributes) ||
      canvas.getContext('webgl', attributes) ||
      canvas.getContext('experimental-webgl', attributes);

    if (!gl) return false;

    try {
      const ctx = gl as WebGLRenderingContext;
      const debugExt = ctx.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugExt
        ? String(ctx.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '')
        : String(ctx.getParameter(ctx.RENDERER) || '');
      const version = String(ctx.getParameter(ctx.VERSION) || '');
      const combined = `${renderer} ${version}`.toLowerCase();

      const blockedPatterns = [
        /geforce\s*9500\s*gt/,
        /d3d11\s*vs_4_0\s*ps_4_0/,
        /9\.18\.13\./,
      ];

      if (blockedPatterns.some((pattern) => pattern.test(combined))) {
        return false;
      }
    } catch {
      return false;
    }

    const loseContext = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    loseContext?.loseContext();

    return true;
  } catch {
    return false;
  }
}

// Planet Data
const PLANETS = [
  { name: 'Mercury', color: '#B5A7A7', size: 0.8, distance: 12, speed: 0.8, description: 'The Swift Planet' },
  { name: 'Venus', color: '#E3BB76', size: 1.5, distance: 18, speed: 0.6, description: 'The Morning Star' },
  { name: 'Earth', color: '#22A6B3', size: 1.6, distance: 26, speed: 0.5, description: 'The Blue Marble' },
  { name: 'Mars', color: '#DD4D35', size: 1.2, distance: 34, speed: 0.4, description: ' The Red Planet' },
  { name: 'Jupiter', color: '#D9A066', size: 3.5, distance: 50, speed: 0.2, description: 'The Giant King' },
  { name: 'Saturn', color: '#F4D03F', size: 3.0, distance: 70, speed: 0.15, ring: true, description: 'The Ringed Jewel' },
  { name: 'Uranus', color: '#7DE3F4', size: 2.2, distance: 90, speed: 0.1, description: 'The Ice Giant' },
  { name: 'Neptune', color: '#3B6FB6', size: 2.1, distance: 110, speed: 0.08, description: 'The Windy One' },
];

function Sun() {
  return (
    <mesh>
      <sphereGeometry args={[4.5, 32, 32]} />
      <meshStandardMaterial 
        emissive="#FDB813"
        emissiveIntensity={2}
        color="#FDB813"
        toneMapped={false}
      />
      <pointLight intensity={2} distance={200} decay={2} color="#FDB813" />
    </mesh>
  );
}

function Planet({ planet, isLowPerf }: { planet: typeof PLANETS[0], isLowPerf: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (orbitRef.current) {
      orbitRef.current.rotation.y = clock.getElapsedTime() * planet.speed * 0.1 + offset;
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005;
    }
  });

  return (
    <group ref={orbitRef}>
      {/* Orbit Path (Visual Only) */}
      {!isLowPerf && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[planet.distance - 0.1, planet.distance + 0.1, 64]} />
          <meshBasicMaterial color="#ffffff" opacity={0.05} transparent side={THREE.DoubleSide} />
        </mesh>
      )}
      
      <group position={[planet.distance, 0, 0]}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[planet.size, 32, 32]} />
          <meshStandardMaterial 
            color={planet.color} 
            roughness={0.7}
            metalness={0.2}
          />
        </mesh>
        
        {planet.ring && (
          <mesh rotation={[-Math.PI / 3, 0, 0]}>
            <ringGeometry args={[planet.size * 1.4, planet.size * 2.2, 32]} />
            <meshStandardMaterial color={planet.color} opacity={0.4} transparent side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function AsteroidBelt({ count = 400, radius = 42 }) {
  const asteroidRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      const r = radius + (Math.random() - 0.5) * 4;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = (Math.random() - 0.5) * 2;
      const scale = Math.random() * 0.2 + 0.05;
      temp.push({ x, y, z, scale, speed: Math.random() * 0.002 + 0.001, offset: Math.random() * Math.PI * 2 });
    }
    return temp;
  }, [count, radius]);

  useFrame(({ clock }) => {
    if (!asteroidRef.current) return;
    const time = clock.getElapsedTime();
    particles.forEach((particle, i) => {
      const angle = time * 0.05 + particle.offset;
      const r = radius; // Simplify movement for performance
      dummy.position.set(
        Math.cos(angle) * r + (particle.x - Math.cos(particle.offset) * r),
        particle.y,
        Math.sin(angle) * r + (particle.z - Math.sin(particle.offset) * r)
      );
      dummy.scale.setScalar(particle.scale);
      dummy.rotation.set(time * particle.speed, time * particle.speed, time * particle.speed);
      dummy.updateMatrix();
      asteroidRef.current!.setMatrixAt(i, dummy.matrix);
    });
    asteroidRef.current.instanceMatrix.needsUpdate = true;
  });

return null;
  /*
  return (
    <instancedMesh ref={asteroidRef} args={[undefined as any, undefined as any, count]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#888888" roughness={0.8} /> 
    </instancedMesh>
  );
  */
}

function SceneContent() {
  const [isLowPerf, setIsLowPerf] = useState(false);

  useEffect(() => {
    // Basic perf detection logic
    const pixelRatio = window.devicePixelRatio;
    if (pixelRatio < 1 || /Mobi|Android/i.test(navigator.userAgent)) {
      setIsLowPerf(true);
    }
  }, []);

  return (
    <>
      <color attach="background" args={['#050510']} />
      <ambientLight intensity={0.1} />
      
      <Sun />
      
      {PLANETS.map((planet) => (
        <Planet key={planet.name} planet={planet} isLowPerf={isLowPerf} />
      ))}
      
      {!isLowPerf && <AsteroidBelt />}
      
      <Stars key={isLowPerf ? 'low' : 'high'} radius={300} depth={50} count={isLowPerf ? 1000 : 5000} factor={4} saturation={0} fade speed={1} />
      
      <OrbitControls 
        enableZoom={false} 
        enablePan={false} 
        autoRotate 
        autoRotateSpeed={0.2}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 3}
      />
    </>
  );
}

export default function SolarSystemBackground() {
  const [webglStatus, setWebglStatus] = useState<WebGLStatus>('checking');

  useEffect(() => {
    const supported = detectWebGLSupport();
    setWebglStatus(supported ? 'enabled' : 'disabled');
  }, []);

  if (webglStatus !== 'enabled') {
    return (
      <div className="fixed inset-0 z-0 bg-[#050510]" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-[#050510]/80 via-transparent to-[#050510]/80 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#050510_100%)] opacity-60 pointer-events-none" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-0 bg-[#050510]" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 60, 90], fov: 45 }}
        gl={{ antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }}
        dpr={[1, 1.5]}
        fallback={null}
      >
        <SceneContent />
      </Canvas>
      
      {/* Gradient Overlay for Text Readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050510]/80 via-transparent to-[#050510]/80 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#050510_100%)] opacity-60 pointer-events-none" />
    </div>
  );
}
