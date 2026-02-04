"use client";

import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";

const WarpStars = React.memo(function WarpStars() {
  const meshRef = useRef<THREE.Points>(null);
  const { positions, velocities } = useMemo(() => {
    const count = 1500;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 100;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 100;
      pos[i * 3 + 2] = Math.random() * 100;
      vel[i] = 0.5 + Math.random() * 0.5;
    }
    return { positions: pos, velocities: vel };
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const posArray = meshRef.current.geometry.attributes.position.array as Float32Array;
    const count = positions.length / 3;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      posArray[idx + 2] -= velocities[i] * delta * 30;
      if (posArray[idx + 2] < -5) {
        posArray[idx + 2] = 80;
        posArray[idx] = (Math.random() - 0.5) * 100;
        posArray[idx + 1] = (Math.random() - 0.5) * 100;
      }
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.12} color="#60a5fa" transparent opacity={0.7} sizeAttenuation blending={THREE.AdditiveBlending} />
    </points>
  );
});

const AndromedaGlow = React.memo(function AndromedaGlow() {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += 0.0003;
      meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 0.3) * 0.05);
    }
  });
  return (
    <mesh ref={meshRef} position={[0, 0, -60]}>
      <sphereGeometry args={[25, 32, 32]} />
      <meshBasicMaterial color="#4c1d95" transparent opacity={0.12} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
    </mesh>
  );
});

const SpeedLines = React.memo(function SpeedLines() {
  const groupRef = useRef<THREE.Group>(null);
  const lines = useMemo(() => Array.from({ length: 15 }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 60,
    y: (Math.random() - 0.5) * 60,
    z: -30 - Math.random() * 40,
    rotation: Math.random() * Math.PI,
    length: 10 + Math.random() * 20,
    speed: 0.5 + Math.random() * 0.5,
  })), []);
  useFrame((state, delta) => { if (groupRef.current) groupRef.current.rotation.z += delta * 0.02; });
  return (
    <group ref={groupRef}>
      {lines.map((line) => (
        <mesh key={line.id} position={[line.x, line.y, line.z]} rotation={[0, 0, line.rotation]}>
          <planeGeometry args={[0.04, line.length]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
});

export default function SpaceBackground() {
  const [isMobile, setIsMobile] = useState(false);
  const [dpr, setDpr] = useState(1);
  useEffect(() => {
    const checkMobile = () => { const mobile = window.innerWidth < 768; setIsMobile(mobile); setDpr(mobile ? 1 : Math.min(window.devicePixelRatio, 2)); };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  return (
    <div className="absolute inset-0 bg-[#000208]">
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }} dpr={dpr} gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }} style={{ background: "#000208" }}>
        <color attach="background" args={["#000208"]} />
        <Stars radius={100} depth={50} count={isMobile ? 1500 : 4000} factor={4} saturation={0} fade speed={0.3} />
        <WarpStars />
        <AndromedaGlow />
        <SpeedLines />
        <ambientLight intensity={0.05} />
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.5)_100%)] pointer-events-none" />
    </div>
  );
}
