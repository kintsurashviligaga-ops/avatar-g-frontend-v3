'use client'

/**
 * AvatarShowcase — Premium 3D Avatar Studio Section
 * ================================================
 * Full-body avatar showcase on futuristic pedestal.
 * Shows placeholder state by default with graceful WebGL fallback.
 */

import { useEffect, useState, useRef, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PresentationControls, Environment } from '@react-three/drei'
import * as THREE from 'three'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Lang = 'en' | 'ka' | 'ru'

const COPY = {
  en: {
    eyebrow: 'AVATAR STUDIO',
    title: 'Create Your Digital Avatar',
    subtitle: 'Own your digital identity. Bring your avatar to life in every workflow.',
    create: 'Create Avatar',
    edit: 'Edit Avatar',
    use: 'Use in Video',
    demo: 'See Premium Features',
  },
  ka: {
    eyebrow: 'ავატარ სტუდია',
    title: 'შექმენი შენი ციფრული ავატარი',
    subtitle: 'იყავი შენი ციფრული კმედობის მბე აბი ყველა workflow-ში.',
    create: 'შექმენი ავატარი',
    edit: 'რედაქტირე',
    use: 'ვიდეოში გამოყენება',
    demo: 'პრემიუმ ფიჩარები',
  },
  ru: {
    eyebrow: 'СТУДИЯ АВАТАРОВ',
    title: 'Создайте свой цифровой аватар',
    subtitle: 'Владейте своей цифровой идентичностью. Оживите вашего аватара в каждом workflow.',
    create: 'Создать аватар',
    edit: 'Редактировать',
    use: 'Использовать в видео',
    demo: 'Посмотреть премиум',
  },
} as const

/**
 * Premium futuristic pedestal — glowing base
 */
function Pedestal() {
  const meshRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001
    }
  })

  return (
    <group ref={meshRef}>
      {/* Main pedestal cylinder */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.4, 0.3, 32]} />
        <meshStandardMaterial
          color="#0a1a2e"
          metalness={0.8}
          roughness={0.2}
          emissive="#22d3ee"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Top accent ring */}
      <mesh position={[0, 0.16, 0]} castShadow>
        <torusGeometry args={[1.35, 0.08, 32, 32]} />
        <meshStandardMaterial
          color="#22d3ee"
          metalness={0.9}
          roughness={0.1}
          emissive="#22d3ee"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Bottom ring */}
      <mesh position={[0, -0.15, 0]}>
        <torusGeometry args={[1.4, 0.06, 32, 32]} />
        <meshStandardMaterial
          color="#06b6d4"
          metalness={0.8}
          roughness={0.15}
          emissive="#06b6d4"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Center spike */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <coneGeometry args={[0.15, 0.4, 32]} />
        <meshStandardMaterial
          color="#0ea5e9"
          metalness={0.9}
          roughness={0.1}
          emissive="#0ea5e9"
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Glow effect */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[1.6, 1.8, 0.5, 32]} />
        <meshStandardMaterial
          color="#22d3ee"
          transparent
          opacity={0.1}
          emissive="#22d3ee"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  )
}

/**
 * Placeholder avatar — simple geometric shape
 */
function PlaceholderAvatar() {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.008
    }
  })

  return (
    <group ref={groupRef} position={[0, 0.5, 0]}>
      {/* Head */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshStandardMaterial
          color="#a78bfa"
          metalness={0.5}
          roughness={0.4}
          emissive="#a78bfa"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Face glow */}
      <mesh position={[0, 1.6, 0.4]}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial
          color="#a78bfa"
          transparent
          opacity={0.15}
          emissive="#a78bfa"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.5, 0.8, 0.4]} />
        <meshStandardMaterial
          color="#6366f1"
          metalness={0.4}
          roughness={0.5}
          emissive="#6366f1"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Left arm */}
      <mesh position={[-0.5, 1.0, 0]} castShadow>
        <boxGeometry args={[0.2, 0.9, 0.25]} />
        <meshStandardMaterial
          color="#4f46e5"
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>

      {/* Right arm */}
      <mesh position={[0.5, 1.0, 0]} castShadow>
        <boxGeometry args={[0.2, 0.9, 0.25]} />
        <meshStandardMaterial
          color="#4f46e5"
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>

      {/* Left leg */}
      <mesh position={[-0.2, 0.2, 0]} castShadow>
        <boxGeometry args={[0.18, 0.8, 0.25]} />
        <meshStandardMaterial
          color="#3730a3"
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>

      {/* Right leg */}
      <mesh position={[0.2, 0.2, 0]} castShadow>
        <boxGeometry args={[0.18, 0.8, 0.25]} />
        <meshStandardMaterial
          color="#3730a3"
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>
    </group>
  )
}

/**
 * Lighting rig — premium cinematic setup
 */
function Lights() {
  return (
    <>
      {/* Main key light — soft cyan */}
      <directionalLight position={[4, 6, 3]} intensity={1.2} color="#22d3ee" castShadow />

      {/* Fill light — cool blue */}
      <directionalLight position={[-3, 4, 5]} intensity={0.6} color="#0ea5e9" />

      {/* Rim light — cyan edge glow */}
      <pointLight position={[0, 3, 6]} intensity={0.8} color="#22d3ee" />

      {/* Base light — subtle bottom glow */}
      <pointLight position={[0, -1, 0]} intensity={0.4} color="#06b6d4" />

      {/* Ambient — overall cool tone */}
      <ambientLight intensity={0.4} color="#0c4a6e" />
    </>
  )
}

/**
 * Main 3D Scene — avatar on pedestal
 * Falls back gracefully if WebGL unavailable
 */
function ShowcaseScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [webglAvailable, setWebglAvailable] = useState(true)

  useEffect(() => {
    // Test WebGL availability
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2')
      if (!gl) setWebglAvailable(false)
    } catch {
      setWebglAvailable(false)
    }
  }, [])

  if (!webglAvailable) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        {/* Beautiful static fallback */}
        <div className="text-center px-6">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center text-5xl" style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.2) 0%, transparent 70%)' }}>
            👤
          </div>
          <h3 className="text-xl font-bold mb-2" style={{ color: '#fff' }}>
            3D Preview Not Available
          </h3>
          <p className="text-sm text-gray-400">
            Your system doesn't support WebGL. Click below to create your avatar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Canvas
      ref={containerRef as any}
      camera={{ position: [0, 1.2, 4], fov: 50, near: 0.1, far: 1000 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
      shadows
      onCreated={(state) => {
        try {
          state.gl.context.getExtension('OES_standard_derivatives')
        } catch (e) {
          console.warn('WebGL extension unavailable')
        }
      }}
    >
      <Lights />
      <Environment preset="studio" />

      <PresentationControls
        global
        config={{ mass: 2, tension: 500 }}
        snap={{ mass: 4, tension: 1500 }}
        rotation={[0.1, 0.3, 0]}
        polar={[Math.PI / 2.2, Math.PI / 2.2]}
        azimuth={[-Math.PI / 1.4, Math.PI / 0.7]}
      >
        <group>
          {/* Pedestal */}
          <Pedestal />

          {/* Avatar — placeholder for now */}
          <PlaceholderAvatar />
        </group>
      </PresentationControls>
    </Canvas>
  )
}

/**
 * Premium CTA state — when no avatar exists
 */
function FallbackState({ locale, onAction }: { locale: string; onAction: () => void }) {
  const lang = (locale as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
      {/* Gradient background overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(99,102,241,0.04) 100%)`,
        }}
      />

      <div className="relative z-10">
        {/* Logo mark */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(34,211,238,0.2) 0%, transparent 70%)',
              filter: 'blur(12px)',
            }}
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-full h-full text-cyan-400"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M 6 20 Q 6 14 12 14 Q 18 14 18 20" />
          </svg>
        </div>

        <h3 className="text-xl sm:text-2xl font-bold mb-2" style={{ color: '#fff' }}>
          {c.title}
        </h3>
        <p className="text-sm text-gray-400 mb-8 max-w-sm">{c.subtitle}</p>

        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #22d3ee, #0ea5e9)',
            color: '#fff',
            boxShadow: '0 0 24px rgba(34,211,238,0.3)',
          }}
        >
          {c.create}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/**
 * Main Avatar Showcase Component
 */
export function AvatarShowcase({ locale }: { locale: string }) {
  const { language } = useLanguage()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  const handleCreateClick = () => {
    window.location.href = `/${language}/services/avatar`
  }

  return (
    <section className="relative overflow-hidden px-4 py-16 sm:px-6 md:py-24 lg:px-10">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 sm:mb-12 text-center">
          <p className="text-xs sm:text-sm font-black tracking-[0.3em] uppercase mb-3" style={{ color: 'rgba(34,211,238,0.7)' }}>
            {c.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3" style={{ color: '#fff' }}>
            {c.title}
          </h2>
          <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">{c.subtitle}</p>
        </div>

        {/* 3D Showcase Container */}
        <div className="relative rounded-3xl overflow-hidden mb-8" style={{ aspectRatio: '16/10', minHeight: '400px', background: 'linear-gradient(170deg, #0a1527, #081630 50%, #050d1a)' }}>
          {/* Ambient glow layers */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]" style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />
            <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px]" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)', filter: 'blur(50px)' }} />
          </div>

          {/* 3D Canvas */}
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 rounded-full border-2 border-cyan-400/50 border-t-transparent animate-spin" />
                  <span className="text-xs text-gray-400">Loading avatar...</span>
                </div>
              </div>
            }
          >
            <ShowcaseScene />
          </Suspense>

          {/* Border */}
          <div className="absolute inset-0 rounded-3xl border border-cyan-500/20 pointer-events-none" />
        </div>

        {/* Action row */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleCreateClick}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #22d3ee, #0ea5e9)',
              color: '#fff',
              boxShadow: '0 0 24px rgba(34,211,238,0.3)',
            }}
          >
            {c.create}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <Link
            href={`/${language}/services`}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {c.demo}
          </Link>
        </div>
      </div>
    </section>
  )
}
