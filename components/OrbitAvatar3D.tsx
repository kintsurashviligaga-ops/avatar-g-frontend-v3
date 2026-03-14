'use client';

/**
 * OrbitAvatar3D — Full 3D holographic humanoid avatar
 * Built with @react-three/fiber + Three.js
 * Auto-rotates 360° showing real depth from all angles
 * Premium neon/holographic aesthetic
 * Graceful CSS fallback when WebGL is unavailable
 */

import { useRef, useMemo, useEffect, useState, Component, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────
// WebGL availability check
// ─────────────────────────────────────────────────────────────────
function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const ctx =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!ctx) return false;
    const ext = ctx.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Error boundary — catches WebGL context errors from three.js Canvas
// ─────────────────────────────────────────────────────────────────
interface EBProps { children: ReactNode; fallback: ReactNode }
interface EBState { crashed: boolean }
class CanvasErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError(): EBState { return { crashed: true }; }
  render() {
    if (this.state.crashed) return this.props.fallback;
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────
// CSS-only holographic fallback (no WebGL required)
// ─────────────────────────────────────────────────────────────────
function AvatarCSSFallback() {
  return (
    <div
      className="w-full h-full relative flex items-end justify-center overflow-hidden"
      style={{ background: 'transparent' }}
    >
      <style>{`
        @keyframes css3d-spin {
          from { transform: rotateY(0deg); }
          to   { transform: rotateY(360deg); }
        }
        @keyframes css3d-float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-7px); }
        }
        @keyframes css3d-scan {
          0%   { top: 8%; opacity:0.18; }
          50%  { top: 88%; opacity:0.10; }
          100% { top: 8%; opacity:0.18; }
        }
        @keyframes css3d-ring1 {
          0%   { transform: rotateZ(0deg) rotateX(65deg); }
          100% { transform: rotateZ(360deg) rotateX(65deg); }
        }
        @keyframes css3d-ring2 {
          0%   { transform: rotateZ(0deg) rotateX(30deg); }
          100% { transform: rotateZ(-360deg) rotateX(30deg); }
        }
        @keyframes css3d-pulse {
          0%,100% { opacity:0.55; transform:scale(1); }
          50%      { opacity:0.85; transform:scale(1.06); }
        }
        .css3d-body { animation: css3d-float 3.6s ease-in-out infinite; }
        .css3d-figure { animation: css3d-spin 12s linear infinite; transform-style: preserve-3d; }
      `}</style>

      {/* Outer orbit rings */}
      <div className="pointer-events-none absolute inset-[8%]" style={{ perspective: '600px' }}>
        <div style={{
          position:'absolute', inset:0,
          border: '1.5px solid rgba(34,211,238,0.35)',
          borderRadius: '50%',
          animation: 'css3d-ring1 7s linear infinite',
        }} />
        <div style={{
          position:'absolute', inset:'12%',
          border: '1px solid rgba(6,182,212,0.28)',
          borderRadius: '50%',
          animation: 'css3d-ring2 10s linear infinite',
        }} />
      </div>

      {/* Holographic scan line */}
      <div className="pointer-events-none absolute left-[15%] right-[15%]" style={{
        height: '2px',
        background: 'linear-gradient(90deg,transparent,rgba(34,211,238,0.7),transparent)',
        animation: 'css3d-scan 3s ease-in-out infinite',
        zIndex: 10,
      }} />

      {/* Body */}
      <div className="css3d-body absolute inset-0 flex items-center justify-center" style={{ perspective: '300px' }}>
        <div className="css3d-figure flex flex-col items-center" style={{ gap: 0 }}>
          {/* Head */}
          <div style={{
            width:'32%', paddingTop:'32%', borderRadius:'50%',
            background:'linear-gradient(145deg,rgba(56,189,248,0.25),rgba(6,182,212,0.08))',
            border:'1.5px solid rgba(34,211,238,0.60)',
            boxShadow:'0 0 14px rgba(34,211,238,0.35), inset 0 0 10px rgba(34,211,238,0.12)',
            marginBottom:'2%',
          }} />
          {/* Neck */}
          <div style={{
            width:'12%', height:'5%',
            background:'rgba(34,211,238,0.18)',
            border:'1px solid rgba(34,211,238,0.35)',
          }} />
          {/* Shoulders + torso row */}
          <div style={{ display:'flex', alignItems:'flex-start', width:'100%', justifyContent:'center' }}>
            {/* Left shoulder */}
            <div style={{
              width:'22%', height:'10%', borderRadius:'50% 50% 0 0',
              background:'linear-gradient(180deg,rgba(6,182,212,0.30),rgba(6,182,212,0.12))',
              border:'1px solid rgba(6,182,212,0.50)',
              marginTop:'1%', alignSelf:'flex-start',
            }} />
            {/* Torso */}
            <div style={{
              width:'44%', height: undefined,
              flex:'0 0 44%',
              background:'linear-gradient(180deg,rgba(6,182,212,0.20),rgba(6,182,212,0.07))',
              border:'1px solid rgba(34,211,238,0.50)',
              boxShadow:'0 0 20px rgba(34,211,238,0.18), inset 0 0 12px rgba(34,211,238,0.08)',
              padding:'3% 0 5%',
              position:'relative', overflow:'hidden',
            }}>
              {/* Chest reactor */}
              <div style={{
                width:'25%', paddingTop:'25%', borderRadius:'50%',
                background:'rgba(6,182,212,0.55)',
                border:'1px solid rgba(6,182,212,0.90)',
                boxShadow:'0 0 10px rgba(6,182,212,0.70)',
                margin:'0 auto',
                animation:'css3d-pulse 2s ease-in-out infinite',
              }} />
              {/* Horizontal lines */}
              {[30,55,75].map(top => (
                <div key={top} style={{
                  position:'absolute', left:'10%', right:'10%', top:`${top}%`,
                  height:'1px', background:'rgba(34,211,238,0.25)',
                }} />
              ))}
            </div>
            {/* Right shoulder */}
            <div style={{
              width:'22%', height:'10%', borderRadius:'50% 50% 0 0',
              background:'linear-gradient(180deg,rgba(6,182,212,0.30),rgba(6,182,212,0.12))',
              border:'1px solid rgba(6,182,212,0.50)',
              marginTop:'1%', alignSelf:'flex-start',
            }} />
          </div>
          {/* Arms + Hip row */}
          <div style={{ display:'flex', width:'100%', justifyContent:'center' }}>
            {/* Left arm */}
            <div style={{
              width:'16%', height:'22%',
              background:'rgba(6,182,212,0.15)',
              border:'1px solid rgba(34,211,238,0.35)',
              borderRadius:'0 0 4px 4px',
            }} />
            {/* Hips */}
            <div style={{
              width:'44%',
              background:'linear-gradient(180deg,rgba(6,182,212,0.15),rgba(6,182,212,0.06))',
              border:'1px solid rgba(34,211,238,0.40)',
            }} />
            {/* Right arm */}
            <div style={{
              width:'16%', height:'22%',
              background:'rgba(6,182,212,0.15)',
              border:'1px solid rgba(34,211,238,0.35)',
              borderRadius:'0 0 4px 4px',
            }} />
          </div>
          {/* Legs */}
          <div style={{ display:'flex', width:'44%', justifyContent:'space-around' }}>
            {[0,1].map(i => (
              <div key={i} style={{
                width:'44%',
                background:'rgba(6,182,212,0.13)',
                border:'1px solid rgba(34,211,238,0.32)',
                borderRadius:'0 0 3px 3px',
              }}>
                {/* Knee accent */}
                <div style={{
                  width:'80%', height:'3px', margin:'35% auto 0',
                  background:'rgba(6,182,212,0.60)',
                  borderRadius:'2px',
                }} />
              </div>
            ))}
          </div>
          {/* Feet */}
          <div style={{ display:'flex', width:'44%', justifyContent:'space-around', marginTop:'1%' }}>
            {[0,1].map(i => (
              <div key={i} style={{
                width:'50%', height:'4px',
                background:'rgba(34,211,238,0.50)',
                border:'1px solid rgba(34,211,238,0.70)',
                borderRadius:'2px',
                boxShadow:'0 0 8px rgba(34,211,238,0.40)',
              }} />
            ))}
          </div>
          {/* Platform */}
          <div style={{
            width:'60%', height:'3px', marginTop:'4%',
            background:'rgba(34,211,238,0.40)',
            borderRadius:'50%',
            boxShadow:'0 0 14px rgba(34,211,238,0.50)',
          }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shared material factory
// ─────────────────────────────────────────────────────────────────
function makeMat(
  color: string,
  emissive: string,
  emissiveIntensity: number,
  alpha = 1,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(emissive),
    emissiveIntensity,
    metalness: 0.88,
    roughness: 0.09,
    transparent: alpha < 1,
    opacity: alpha,
  });
}

// ─────────────────────────────────────────────────────────────────
// Full-body humanoid figure
// ─────────────────────────────────────────────────────────────────
function HumanFigure({ avatarUrl }: { avatarUrl: string | null }) {
  const rootRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tick = useRef(0);

  // Materials — created once, disposed on unmount
  const M = useMemo(() => ({
    B: makeMat('#060c1a', '#22d3ee', 0.55),      // Body — dark blue + cyan emissive
    A: makeMat('#0a0520', '#22d3ee', 0.88),      // Accent — dark + cyan emissive
    H: makeMat('#081426', '#38bdf8', 0.70),      // Head — sky-blue emissive
    GW: new THREE.MeshBasicMaterial({            // Ghost wireframe overlay
      color: new THREE.Color('#22d3ee'),
      wireframe: true,
      transparent: true,
      opacity: 0.09,
    }),
    PLAT: new THREE.MeshBasicMaterial({          // Platform glow
      color: new THREE.Color('#22d3ee'),
      transparent: true,
      opacity: 0.48,
    }),
    PLATFILL: new THREE.MeshBasicMaterial({      // Platform fill
      color: new THREE.Color('#22d3ee'),
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
    }),
  }), []);

  // Dispose on unmount
  useEffect(() => {
    const mats = M;
    return () => { Object.values(mats).forEach((m) => m.dispose()); };
  }, [M]);

  // Auto-rotate + float
  useFrame((_, delta) => {
    tick.current += delta;
    if (rootRef.current) {
      rootRef.current.rotation.y += delta * 0.52;          // ~1 full rotation per 12 s
      rootRef.current.position.y = Math.sin(tick.current * 0.65) * 0.038;
    }
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(tick.current * 0.36) * 0.12;
      headRef.current.rotation.x = Math.sin(tick.current * 0.28) * 0.04;
    }
  });

  const { B, A, H, GW, PLAT, PLATFILL } = M;

  return (
    <group ref={rootRef}>

      {/* ══ PLATFORM ══ */}
      <mesh material={PLAT} position={[0, -1.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.016, 6, 64]} />
      </mesh>
      <mesh material={PLATFILL} position={[0, -1.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.26, 40]} />
      </mesh>
      {/* Platform secondary ring */}
      <mesh position={[0, -1.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.38, 0.008, 6, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.25} />
      </mesh>

      {/* ══ HEAD ══ */}
      <group ref={headRef} position={[0, 0.785, 0]}>
        {/* Main skull */}
        <mesh material={H}>
          <sphereGeometry args={[0.164, 30, 30]} />
        </mesh>
        {/* Ghost wireframe over skull */}
        <mesh material={GW}>
          <sphereGeometry args={[0.167, 12, 12]} />
        </mesh>
        {/* Holographic visor/face strip */}
        <mesh material={A} position={[0, 0.005, 0.152]} rotation={[0.08, 0, 0]}>
          <boxGeometry args={[0.174, 0.065, 0.007]} />
        </mesh>
        {/* Eyes */}
        <mesh material={A} position={[0.057, 0.018, 0.148]}>
          <sphereGeometry args={[0.022, 14, 14]} />
        </mesh>
        <mesh material={A} position={[-0.057, 0.018, 0.148]}>
          <sphereGeometry args={[0.022, 14, 14]} />
        </mesh>
        {/* Back skull detail */}
        <mesh material={A} position={[0, 0.015, -0.152]}>
          <boxGeometry args={[0.130, 0.080, 0.007]} />
        </mesh>
        {/* Neural crown ring */}
        <mesh material={A} position={[0, 0.055, 0]} rotation={[0.14, 0, 0]}>
          <torusGeometry args={[0.168, 0.010, 6, 36]} />
        </mesh>
        {/* Crown dots */}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => {
          const r = 0.168;
          const a = (deg * Math.PI) / 180;
          return (
            <mesh key={i} material={A} position={[r * Math.cos(a), 0.055, r * Math.sin(a)]}>
              <sphereGeometry args={[0.010, 8, 8]} />
            </mesh>
          );
        })}
      </group>

      {/* ══ NECK ══ */}
      <mesh material={B} position={[0, 0.577, 0]}>
        <cylinderGeometry args={[0.062, 0.072, 0.140, 14]} />
      </mesh>
      {/* Neck collar ring */}
      <mesh material={A} position={[0, 0.500, 0]}>
        <torusGeometry args={[0.080, 0.010, 6, 24]} />
      </mesh>

      {/* ══ TORSO ══ */}
      <mesh material={B} position={[0, 0.295, 0]}>
        <boxGeometry args={[0.355, 0.402, 0.186]} />
      </mesh>
      {/* Wireframe torso overlay */}
      <mesh material={GW} position={[0, 0.295, 0]}>
        <boxGeometry args={[0.358, 0.406, 0.189]} />
      </mesh>
      {/* Chest plate */}
      <mesh material={A} position={[0, 0.335, 0.095]}>
        <boxGeometry args={[0.168, 0.130, 0.009]} />
      </mesh>
      {/* Chest reactor core */}
      <mesh material={A} position={[0, 0.335, 0.100]}>
        <sphereGeometry args={[0.031, 16, 16]} />
      </mesh>
      {/* Reactor ring */}
      <mesh material={A} position={[0, 0.335, 0.096]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.042, 0.007, 6, 20]} />
      </mesh>
      {/* Collar bone bar */}
      <mesh material={A} position={[0, 0.483, 0.092]}>
        <boxGeometry args={[0.264, 0.018, 0.007]} />
      </mesh>
      {/* Waistband */}
      <mesh material={A} position={[0, 0.098, 0.094]}>
        <boxGeometry args={[0.330, 0.018, 0.007]} />
      </mesh>
      {/* Left/right side vertical panels */}
      <mesh material={A} position={[0.179, 0.295, 0.094]}>
        <boxGeometry args={[0.013, 0.280, 0.007]} />
      </mesh>
      <mesh material={A} position={[-0.179, 0.295, 0.094]}>
        <boxGeometry args={[0.013, 0.280, 0.007]} />
      </mesh>
      {/* Abs horizontal lines */}
      {[0.38, 0.295, 0.21].map((y, i) => (
        <group key={i}>
          <mesh material={A} position={[0.115, y, 0.094]}>
            <boxGeometry args={[0.048, 0.014, 0.007]} />
          </mesh>
          <mesh material={A} position={[-0.115, y, 0.094]}>
            <boxGeometry args={[0.048, 0.014, 0.007]} />
          </mesh>
        </group>
      ))}
      {/* BACK — spine column */}
      <mesh material={A} position={[0, 0.295, -0.096]}>
        <boxGeometry args={[0.038, 0.320, 0.007]} />
      </mesh>
      {/* Back shoulder blade detailing */}
      <mesh material={A} position={[0.105, 0.380, -0.095]}>
        <boxGeometry args={[0.068, 0.080, 0.007]} />
      </mesh>
      <mesh material={A} position={[-0.105, 0.380, -0.095]}>
        <boxGeometry args={[0.068, 0.080, 0.007]} />
      </mesh>

      {/* ══ SHOULDERS ══ */}
      <mesh material={A} position={[0.206, 0.502, 0]}>
        <sphereGeometry args={[0.090, 20, 20]} />
      </mesh>
      <mesh material={A} position={[-0.206, 0.502, 0]}>
        <sphereGeometry args={[0.090, 20, 20]} />
      </mesh>

      {/* ══ UPPER ARMS ══ */}
      <mesh material={B} position={[0.272, 0.313, 0]} rotation={[0, 0, 0.21]}>
        <cylinderGeometry args={[0.052, 0.047, 0.270, 14]} />
      </mesh>
      <mesh material={B} position={[-0.272, 0.313, 0]} rotation={[0, 0, -0.21]}>
        <cylinderGeometry args={[0.052, 0.047, 0.270, 14]} />
      </mesh>
      {/* Arm band ring detail */}
      <mesh material={A} position={[0.261, 0.43, 0]} rotation={[0, 0, 0.21]}>
        <torusGeometry args={[0.050, 0.007, 6, 16]} />
      </mesh>
      <mesh material={A} position={[-0.261, 0.43, 0]} rotation={[0, 0, -0.21]}>
        <torusGeometry args={[0.050, 0.007, 6, 16]} />
      </mesh>

      {/* ══ ELBOW JOINTS ══ */}
      <mesh material={A} position={[0.300, 0.155, 0.013]}>
        <sphereGeometry args={[0.044, 14, 14]} />
      </mesh>
      <mesh material={A} position={[-0.300, 0.155, 0.013]}>
        <sphereGeometry args={[0.044, 14, 14]} />
      </mesh>

      {/* ══ FOREARMS ══ */}
      <mesh material={B} position={[0.306, -0.022, 0.024]} rotation={[0.21, 0, 0.14]}>
        <cylinderGeometry args={[0.041, 0.035, 0.250, 12]} />
      </mesh>
      <mesh material={B} position={[-0.306, -0.022, 0.024]} rotation={[0.21, 0, -0.14]}>
        <cylinderGeometry args={[0.041, 0.035, 0.250, 12]} />
      </mesh>
      {/* Forearm tech band */}
      <mesh material={A} position={[0.312, 0.055, 0.016]} rotation={[0.21, 0, 0.14]}>
        <torusGeometry args={[0.039, 0.007, 6, 14]} />
      </mesh>
      <mesh material={A} position={[-0.312, 0.055, 0.016]} rotation={[0.21, 0, -0.14]}>
        <torusGeometry args={[0.039, 0.007, 6, 14]} />
      </mesh>

      {/* ══ HANDS ══ */}
      <mesh material={H} position={[0.315, -0.155, 0.040]}>
        <sphereGeometry args={[0.049, 16, 16]} />
      </mesh>
      <mesh material={H} position={[-0.315, -0.155, 0.040]}>
        <sphereGeometry args={[0.049, 16, 16]} />
      </mesh>

      {/* ══ HIPS / PELVIS ══ */}
      <mesh material={B} position={[0, 0.068, 0]}>
        <boxGeometry args={[0.315, 0.144, 0.176]} />
      </mesh>
      {/* Hip detail lines */}
      <mesh material={A} position={[0.130, 0.068, 0.090]}>
        <boxGeometry args={[0.040, 0.120, 0.007]} />
      </mesh>
      <mesh material={A} position={[-0.130, 0.068, 0.090]}>
        <boxGeometry args={[0.040, 0.120, 0.007]} />
      </mesh>

      {/* ══ THIGHS ══ */}
      <mesh material={B} position={[0.098, -0.146, 0]}>
        <cylinderGeometry args={[0.075, 0.067, 0.290, 14]} />
      </mesh>
      <mesh material={B} position={[-0.098, -0.146, 0]}>
        <cylinderGeometry args={[0.075, 0.067, 0.290, 14]} />
      </mesh>
      {/* Thigh armor panel */}
      <mesh material={A} position={[0.098, -0.100, 0.076]}>
        <boxGeometry args={[0.058, 0.090, 0.007]} />
      </mesh>
      <mesh material={A} position={[-0.098, -0.100, 0.076]}>
        <boxGeometry args={[0.058, 0.090, 0.007]} />
      </mesh>

      {/* ══ KNEE JOINTS ══ */}
      <mesh material={A} position={[0.098, -0.300, 0.012]}>
        <sphereGeometry args={[0.060, 16, 16]} />
      </mesh>
      <mesh material={A} position={[-0.098, -0.300, 0.012]}>
        <sphereGeometry args={[0.060, 16, 16]} />
      </mesh>

      {/* ══ SHINS ══ */}
      <mesh material={B} position={[0.098, -0.506, 0]}>
        <cylinderGeometry args={[0.053, 0.041, 0.298, 12]} />
      </mesh>
      <mesh material={B} position={[-0.098, -0.506, 0]}>
        <cylinderGeometry args={[0.053, 0.041, 0.298, 12]} />
      </mesh>
      {/* Shin front guard */}
      <mesh material={A} position={[0.098, -0.480, 0.055]}>
        <boxGeometry args={[0.032, 0.120, 0.007]} />
      </mesh>
      <mesh material={A} position={[-0.098, -0.480, 0.055]}>
        <boxGeometry args={[0.032, 0.120, 0.007]} />
      </mesh>

      {/* ══ ANKLE JOINTS ══ */}
      <mesh material={A} position={[0.098, -0.667, 0]}>
        <sphereGeometry args={[0.036, 12, 12]} />
      </mesh>
      <mesh material={A} position={[-0.098, -0.667, 0]}>
        <sphereGeometry args={[0.036, 12, 12]} />
      </mesh>

      {/* ══ FEET ══ */}
      <mesh material={A} position={[0.098, -0.720, 0.040]}>
        <boxGeometry args={[0.095, 0.052, 0.162]} />
      </mesh>
      <mesh material={A} position={[-0.098, -0.720, 0.040]}>
        <boxGeometry args={[0.095, 0.052, 0.162]} />
      </mesh>
      {/* Heel block */}
      <mesh material={B} position={[0.098, -0.720, -0.044]}>
        <boxGeometry args={[0.082, 0.052, 0.060]} />
      </mesh>
      <mesh material={B} position={[-0.098, -0.720, -0.044]}>
        <boxGeometry args={[0.082, 0.052, 0.060]} />
      </mesh>

    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// Two tilted neon rings orbiting around the figure
// ─────────────────────────────────────────────────────────────────
function NeonOrbitRings() {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const ring3 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring1.current) {
      ring1.current.rotation.y = t * 0.42;
      ring1.current.rotation.x = Math.sin(t * 0.20) * 0.55;
    }
    if (ring2.current) {
      ring2.current.rotation.y = -t * 0.64;
      ring2.current.rotation.z = Math.cos(t * 0.17) * 0.50;
    }
    if (ring3.current) {
      ring3.current.rotation.x = t * 0.28;
      ring3.current.rotation.z = t * 0.18;
    }
  });

  return (
    <>
      <mesh ref={ring1}>
        <torusGeometry args={[0.72, 0.007, 6, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.36} />
      </mesh>
      <mesh ref={ring2}>
        <torusGeometry args={[0.88, 0.005, 6, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.28} />
      </mesh>
      <mesh ref={ring3}>
        <torusGeometry args={[0.60, 0.004, 6, 48]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.22} />
      </mesh>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Particle cloud surrounding the figure
// ─────────────────────────────────────────────────────────────────
function HologramParticles() {
  const ptsRef = useRef<THREE.Points>(null);

  const positions = useMemo<Float32Array>(() => {
    const N = 180;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // Distribute in a rough ellipsoid matching the figure's proportions
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * Math.random());
      const r = 0.60 + Math.random() * 0.62;
      arr[i * 3]     =  r * Math.sin(phi) * Math.cos(theta) * 0.88;
      arr[i * 3 + 1] = (r * Math.sin(phi) * Math.sin(theta) * 1.10) - 0.12;
      arr[i * 3 + 2] =  r * Math.cos(phi) * 0.80;
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (ptsRef.current) {
      ptsRef.current.rotation.y = state.clock.elapsedTime * 0.0022 * 10;
    }
  });

  return (
    <Points ref={ptsRef} positions={positions} stride={3} frustumCulled>
      <PointMaterial
        color="#22d3ee"
        size={0.013}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
      />
    </Points>
  );
}

// ─────────────────────────────────────────────────────────────────
// Vertical scan line that sweeps through the figure
// ─────────────────────────────────────────────────────────────────
function ScanPlane() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      // Sweep up and down
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.55) * 0.90;
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.06 + 0.05 * Math.abs(Math.sin(state.clock.elapsedTime * 0.55));
    }
  });

  return (
    <mesh ref={ref} rotation={[0, 0, 0]}>
      <planeGeometry args={[1.20, 0.025, 1, 1]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.08} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main exported 3D canvas
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// Three.js Canvas (only mounted when WebGL is confirmed available)
// ─────────────────────────────────────────────────────────────────
function Avatar3DCanvas({ avatarUrl }: { avatarUrl: string | null }) {
  return (
    <Canvas
      camera={{ position: [0, -0.04, 2.58], fov: 40 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      dpr={[1, 1.5]}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.28} />
      <pointLight position={[1.5, 2.4, 2.0]}  intensity={3.2} color="#22d3ee" />
      <pointLight position={[-1.8, 1.2, -1.4]} intensity={2.6} color="#22d3ee" />
      <pointLight position={[0.5, -1.6, 2.4]}  intensity={2.0} color="#3b82f6" />
      <pointLight position={[0, 0.6, -2.8]}    intensity={1.2} color="#1d4ed8" />
      <HumanFigure avatarUrl={avatarUrl} />
      <NeonOrbitRings />
      <HologramParticles />
      <ScanPlane />
    </Canvas>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main export — WebGL check → error boundary → CSS fallback
// ─────────────────────────────────────────────────────────────────
export function OrbitAvatar3D({ avatarUrl }: { avatarUrl: string | null }) {
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglOk(isWebGLAvailable());
  }, []);

  // Not yet checked (SSR / first paint) — render nothing to avoid flash
  if (webglOk === null) {
    return (
      <div
        className="w-full h-full"
        style={{ background: 'transparent' }}
      />
    );
  }

  // WebGL unavailable — show CSS holographic fallback
  if (!webglOk) {
    return <AvatarCSSFallback />;
  }

  // WebGL available — mount Canvas inside error boundary so any runtime
  // context-creation failure (e.g. GPU resets) still renders the fallback
  return (
    <CanvasErrorBoundary fallback={<AvatarCSSFallback />}>
      <Avatar3DCanvas avatarUrl={avatarUrl} />
    </CanvasErrorBoundary>
  );
}

export default OrbitAvatar3D;
