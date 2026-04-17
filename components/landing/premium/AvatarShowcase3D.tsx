'use client'

/**
 * AvatarShowcase3D — Premium 3D avatar display with
 * futuristic pedestal, slow rotation, cinematic lighting.
 *
 * Uses @react-three/fiber + @react-three/drei.
 * Shows the user's GLB model if available, otherwise
 * renders a holographic silhouette placeholder.
 */

import { Suspense, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  ContactShadows,
  Float,
  useGLTF,
  Center,
} from '@react-three/drei'
import * as THREE from 'three'

/* ── Avatar Model (user's GLB) ── */
function AvatarModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const groupRef = useRef<THREE.Group>(null!)

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15
    }
  })

  const cloned = useMemo(() => scene.clone(true), [scene])

  return (
    <Center>
      <group ref={groupRef}>
        <primitive object={cloned} scale={1.6} />
      </group>
    </Center>
  )
}

/* ── Holographic Silhouette Placeholder ── */
function HolographicSilhouette() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const ringRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.2
      meshRef.current.position.y = Math.sin(t * 0.8) * 0.05 + 0.85
    }
    if (ringRef.current) {
      ringRef.current.rotation.y = -t * 0.3
    }
  })

  return (
    <group>
      {/* Body silhouette — capsule shape */}
      <mesh ref={meshRef} position={[0, 0.85, 0]}>
        <capsuleGeometry args={[0.25, 0.9, 16, 32]} />
        <meshStandardMaterial
          color="#a78bfa"
          transparent
          opacity={0.12}
          emissive="#a78bfa"
          emissiveIntensity={0.4}
          wireframe
        />
      </mesh>
      {/* Head sphere */}
      <mesh position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshStandardMaterial
          color="#a78bfa"
          transparent
          opacity={0.1}
          emissive="#a78bfa"
          emissiveIntensity={0.5}
          wireframe
        />
      </mesh>
      {/* Floating scan ring */}
      <mesh ref={ringRef} position={[0, 0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.008, 16, 64]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#22d3ee"
          emissiveIntensity={1.5}
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  )
}

/* ── Futuristic Pedestal ── */
function Pedestal() {
  const ringRef = useRef<THREE.Mesh>(null!)
  const ring2Ref = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ringRef.current) ringRef.current.rotation.y = t * 0.4
    if (ring2Ref.current) ring2Ref.current.rotation.y = -t * 0.25
  })

  return (
    <group position={[0, -0.05, 0]}>
      {/* Main platform disc */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.8, 0.85, 0.06, 64]} />
        <meshStandardMaterial
          color="#0a0f1a"
          metalness={0.9}
          roughness={0.15}
          emissive="#22d3ee"
          emissiveIntensity={0.08}
        />
      </mesh>
      {/* Inner glow disc */}
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.72, 64]} />
        <meshStandardMaterial
          color="#22d3ee"
          transparent
          opacity={0.05}
          emissive="#22d3ee"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Outer ring */}
      <mesh ref={ringRef} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.82, 0.006, 8, 128]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#22d3ee"
          emissiveIntensity={2}
          transparent
          opacity={0.5}
        />
      </mesh>
      {/* Second decorative ring */}
      <mesh ref={ring2Ref} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.68, 0.004, 8, 128]} />
        <meshStandardMaterial
          color="#a78bfa"
          emissive="#a78bfa"
          emissiveIntensity={1.5}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  )
}

/* ── Ambient Particles ── */
function Particles({ count = 40 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!)

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 3
      pos[i * 3 + 1] = Math.random() * 3
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3
    }
    return pos
  }, [count])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    const posAttr = ref.current.geometry.attributes.position
    if (!posAttr?.array) return
    const arr = posAttr.array as unknown as Float32Array
    for (let i = 0; i < count; i++) {
      ;(arr as any)[i * 3 + 1] = (((arr as any)[i * 3 + 1]! + 0.003) % 3)
      ;(arr as any)[i * 3] += Math.sin(t + i) * 0.0005
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        color="#22d3ee"
        transparent
        opacity={0.4}
        sizeAttenuation
      />
    </points>
  )
}

/* ── Scene Composition ── */
function AvatarScene({ modelUrl }: { modelUrl: string | null }) {
  return (
    <>
      {/* Cinematic lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 5, 2]} intensity={0.8} color="#ffffff" />
      <pointLight position={[-2, 3, -1]} intensity={0.5} color="#22d3ee" />
      <pointLight position={[2, 1, 2]} intensity={0.3} color="#a78bfa" />
      <spotLight
        position={[0, 6, 0]}
        angle={0.3}
        penumbra={0.8}
        intensity={1.2}
        color="#ffffff"
        castShadow
      />
      {/* Rim light from behind */}
      <pointLight position={[0, 2, -3]} intensity={0.6} color="#22d3ee" />

      {/* Avatar or placeholder */}
      <Float speed={0.8} rotationIntensity={0} floatIntensity={0.15} floatingRange={[-0.02, 0.02]}>
        <group position={[0, 0.05, 0]}>
          {modelUrl ? (
            <AvatarModel url={modelUrl} />
          ) : (
            <HolographicSilhouette />
          )}
        </group>
      </Float>

      <Pedestal />
      <Particles />

      {/* Contact shadows for grounding */}
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.35}
        scale={3}
        blur={2.5}
        far={4}
        color="#22d3ee"
      />

      {/* Fog for depth */}
      <fog attach="fog" args={['#080e14', 4, 12]} />
    </>
  )
}

/* ── Exported 3D Viewer Component ── */
interface AvatarShowcase3DProps {
  modelUrl: string | null
  className?: string
}

export function AvatarShowcase3D({ modelUrl, className = '' }: AvatarShowcase3DProps) {
  return (
    <div className={`relative ${className}`} style={{ minHeight: 420 }}>
      <Canvas
        camera={{ position: [0, 1.2, 3.2], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <AvatarScene modelUrl={modelUrl} />
        </Suspense>
      </Canvas>
    </div>
  )
}
