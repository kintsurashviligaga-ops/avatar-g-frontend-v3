"use client";

import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, OrbitControls, Text3D, Center } from '@react-three/drei'
import * as THREE from 'three'

// Rocket component
function Rocket({ progress }: { progress: number }) {
  const rocketRef = useRef<THREE.Group>(null)
  
  useFrame((state) => {
    if (rocketRef.current) {
      // Trajectory into singularity
      const t = progress * Math.PI * 2
      const radius = 5 - progress * 4.5
      rocketRef.current.position.x = Math.cos(t) * radius
      rocketRef.current.position.z = Math.sin(t) * radius
      rocketRef.current.position.y = progress * 3 - 1.5
      rocketRef.current.lookAt(0, 0, 0)
    }
  })

  return (
    <group ref={rocketRef}>
      {/* Rocket body */}
      <mesh>
        <coneGeometry args={[0.1, 0.4, 8]} />
        <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Rocket flame */}
      <mesh position={[0, -0.3, 0]}>
        <coneGeometry args={[0.05, 0.2, 8]} />
        <meshBasicMaterial color="#06b6d4" />
      </mesh>
    </group>
  )
}

// Singularity (Black Hole)
function Singularity() {
  const singularityRef = useRef<THREE.Mesh>(null)
  const accretionRef = useRef<THREE.Mesh>(null)
  
  useFrame((state) => {
    if (singularityRef.current) {
      singularityRef.current.rotation.z += 0.02
    }
    if (accretionRef.current) {
      accretionRef.current.rotation.z -= 0.01
    }
  })

  return (
    <group>
      {/* Event horizon */}
      <mesh ref={singularityRef}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      {/* Accretion disk */}
      <mesh ref={accretionRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 1.2, 64]} />
        <meshBasicMaterial 
          color="#8b5cf6" 
          side={THREE.DoubleSide}
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Glow */}
      <pointLight color="#8b5cf6" intensity={2} distance={10} />
    </group>
  )
}

// Procedural Avatar G
function AvatarG() {
  const avatarRef = useRef<THREE.Group>(null)
  
  useFrame((state) => {
    if (avatarRef.current) {
      // Breathing animation
      avatarRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.05
      // Subtle rotation
      avatarRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1
    }
  })

  return (
    <group ref={avatarRef} position={[0, -2, 0]}>
      {/* Body (Suit) - Black glossy */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.2, 1.2, 16]} />
        <meshStandardMaterial 
          color="#0a0a0f" 
          metalness={0.9} 
          roughness={0.1}
        />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.8, 0]}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      
      {/* Hat */}
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.1, 16]} />
        <meshStandardMaterial color="#0a0a0f" />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.2, 16]} />
        <meshStandardMaterial color="#0a0a0f" />
      </mesh>
      
      {/* Gold Band on Hat */}
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.02, 16]} />
        <meshStandardMaterial 
          color="#d4af37" 
          metalness={1} 
          roughness={0.2}
        />
      </mesh>
      
      {/* White Plushie */}
      <mesh position={[0.4, 0.2, 0.3]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
      
      {/* Shoes - Black & White */}
      <mesh position={[-0.15, -0.7, 0.1]}>
        <boxGeometry args={[0.15, 0.1, 0.25]} />
        <meshStandardMaterial color="#0a0a0f" />
      </mesh>
      <mesh position={[0.15, -0.7, 0.1]}>
        <boxGeometry args={[0.15, 0.1, 0.25]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

// Orbital Service Icon
function OrbitalIcon({ 
  position, 
  color, 
  icon 
}: { 
  position: [number, number, number], 
  color: string,
  icon: string 
}) {
  const iconRef = useRef<THREE.Group>(null)
  
  useFrame((state) => {
    if (iconRef.current) {
      iconRef.current.lookAt(0, 0, 0)
    }
  })

  return (
    <group ref={iconRef} position={position}>
      {/* Icon background */}
      <mesh>
        <circleGeometry args={[0.3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>
      {/* Glow ring */}
      <mesh scale={[1.2, 1.2, 1.2]}>
        <ringGeometry args={[0.28, 0.32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
    </group>
  )
}

// Orbital System
function OrbitalSystem() {
  const orbitRef = useRef<THREE.Group>(null)
  
  useFrame((state) => {
    if (orbitRef.current) {
      orbitRef.current.rotation.y += 0.005
    }
  })

  const icons = useMemo(() => {
    const items = []
    const colors = ['#d4af37', '#8b5cf6', '#06b6d4', '#f472b6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4', '#d4af37', '#8b5cf6', '#06b6d4']
    for (let i = 0; i < 13; i++) {
      const angle = (i / 13) * Math.PI * 2
      const radius = 3
      items.push({
        position: [Math.cos(angle) * radius, Math.sin(angle * 0.5) * 0.5, Math.sin(angle) * radius] as [number, number, number],
        color: colors[i],
        icon: `S${i + 1}`
      })
    }
    return items
  }, [])

  return (
    <group ref={orbitRef}>
      {icons.map((icon, i) => (
        <OrbitalIcon key={i} {...icon} />
      ))}
    </group>
  )
}

// Main Scene
export default function ExecutiveScene() {
  return (
    <div className="w-full h-screen bg-[#0a0a0f]">
      <Canvas camera={{ position: [0, 0, 8], fov: 60 }}>
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#d4af37" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />
        
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <Rocket progress={0.5} />
        <Singularity />
        <AvatarG />
        <OrbitalSystem />
        
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  )
}
