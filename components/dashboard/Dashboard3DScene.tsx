/**
 * Dashboard 3D Scene - Lightweight WebGL ambient effects
 * Nebula particles + soft glow ring
 * Gracefully degrades if WebGL unavailable
 */

'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial, OrbitControls } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import * as THREE from 'three';

function NebulaParticles({ paused }: { paused: boolean }) {
  const ref = useRef<THREE.Points>(null);
  
  const positions = useMemo(() => {
    const particleCount = 500;
    const buffer = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const x = (Math.random() - 0.5) * 10;
      const y = (Math.random() - 0.5) * 10;
      const z = (Math.random() - 0.5) * 10;
      
      buffer[i * 3] = x;
      buffer[i * 3 + 1] = y;
      buffer[i * 3 + 2] = z;
    }

    return buffer;
  }, []);
  
  useFrame((state) => {
    if (!ref.current) return;
    if (paused) return;
    
    // Gentle rotation
    ref.current.rotation.y += 0.0005;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
  });
  
  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled>
      <PointMaterial
        transparent
        color="#00FFFF"
        size={0.02}
        sizeAttenuation
        depthWrite={false}
        opacity={0.6}
      />
    </Points>
  );
}

function GlowRing({ paused }: { paused: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!ref.current) return;
    if (paused) return;
    ref.current.rotation.z = state.clock.elapsedTime * 0.3;
  });
  
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[2, 0.05, 16, 100]} />
      <meshBasicMaterial color="#D4AF37" transparent opacity={0.3} />
    </mesh>
  );
}

export default function Dashboard3DScene() {
  const [webglAvailable, setWebglAvailable] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    // Check WebGL availability
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebglAvailable(false);
      }
    } catch {
      setWebglAvailable(false);
    }

    // Pause rendering when tab not visible
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Fallback UI if WebGL unavailable
  if (!webglAvailable) {
    return (
      <div className="relative w-full h-[300px] bg-gradient-to-br from-[#05070A] via-[#1A1A1A] to-[#05070A] rounded-2xl overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-gradient-to-r from-[#D4AF37]/20 via-[#00FFFF]/20 to-[#D4AF37]/20 blur-xl" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-[#D4AF37] via-[#00FFFF] to-[#D4AF37] bg-clip-text text-transparent">
              Dashboard
            </h3>
            <p className="text-gray-400 text-sm mt-2">Command Center</p>
          </div>
        </div>
      </div>
    );
  }

  const paused = !isVisible || reduceMotion;

  return (
    <div className="relative w-full h-[300px] bg-gradient-to-br from-[#05070A] via-[#1A1A1A] to-[#05070A] rounded-2xl overflow-hidden">
      {isVisible && (
        <Canvas
          camera={{ position: [0, 0, 5], fov: 50 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
          frameloop={paused ? 'demand' : 'always'}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <ambientLight intensity={0.5} />
          <NebulaParticles paused={paused} />
          <GlowRing paused={paused} />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate={!paused}
            autoRotateSpeed={0.5}
            maxPolarAngle={Math.PI / 2}
            minPolarAngle={Math.PI / 2}
          />
        </Canvas>
      )}
      
      {/* Overlay content */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <h3 className="text-3xl font-bold bg-gradient-to-r from-[#D4AF37] via-[#00FFFF] to-[#D4AF37] bg-clip-text text-transparent">
            AI Control Terminal
          </h3>
          <p className="text-gray-400 text-sm mt-2">Neural Command Center</p>
        </div>
      </div>
    </div>
  );
}
