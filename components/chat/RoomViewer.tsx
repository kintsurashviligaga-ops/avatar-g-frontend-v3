'use client';

/**
 * RoomViewer — inline WebGL (Three.js / R3F) viewer that renders Agent N's
 * RoomGeometry as a real, orbit-able 3D room: floor + 4 walls sized to the
 * estimated dimensions, with door/window openings marked on the correct walls,
 * tinted by Agent K's style palette. The user rotates/inspects the actual
 * extracted geometry — not a static image.
 *
 * Mount via next/dynamic with { ssr: false } (R3F is client-only).
 */
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import type { RoomGeometry, StyleGuide } from '@/lib/orchestrator/interior';

const WALL_T = 0.08; // wall thickness (m)

function Room({ geometry, palette }: { geometry: RoomGeometry; palette: string[] }) {
  const w = geometry.floor.widthM;
  const d = geometry.floor.depthM;
  const h = geometry.wallHeightM;
  const floorColor = palette[0] ?? '#e8e2d6';
  const wallColor = palette[1] ?? '#cfc4b0';
  const accent = palette[2] ?? '#7c6a56';

  // Rectangular room centered at origin; floor on the XZ plane.
  // walls: 0=back(-z) 1=right(+x) 2=front(+z) 3=left(-x)
  const walls = [
    { pos: [0, h / 2, -d / 2] as [number, number, number], size: [w, h, WALL_T] as [number, number, number] },
    { pos: [w / 2, h / 2, 0] as [number, number, number], size: [WALL_T, h, d] as [number, number, number] },
    { pos: [0, h / 2, d / 2] as [number, number, number], size: [w, h, WALL_T] as [number, number, number] },
    { pos: [-w / 2, h / 2, 0] as [number, number, number], size: [WALL_T, h, d] as [number, number, number] },
  ];

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={floorColor} roughness={0.9} />
      </mesh>
      {/* walls */}
      {walls.map((wall, i) => (
        <mesh key={i} position={wall.pos}>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color={wallColor} roughness={0.85} transparent opacity={0.92} />
        </mesh>
      ))}
      {/* openings — colored markers on their wall */}
      {geometry.openings.map((o, i) => {
        const wall = walls[Math.min(o.wall, walls.length - 1)]!;
        const isSide = o.wall === 1 || o.wall === 3;
        const y = o.type === 'door' ? o.heightM / 2 : Math.min(h - o.heightM / 2 - 0.2, 1.4);
        const pos: [number, number, number] = isSide
          ? [wall.pos[0] + (o.wall === 1 ? -0.06 : 0.06), y, 0]
          : [0, y, wall.pos[2] + (o.wall === 0 ? 0.06 : -0.06)];
        const size: [number, number, number] = isSide ? [0.04, o.heightM, o.widthM] : [o.widthM, o.heightM, 0.04];
        return (
          <mesh key={`op${i}`} position={pos}>
            <boxGeometry args={size} />
            <meshStandardMaterial color={o.type === 'door' ? accent : '#bcd3e8'} emissive={o.type === 'window' ? '#9cc3e0' : '#000'} emissiveIntensity={o.type === 'window' ? 0.25 : 0} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function RoomViewer({ geometry, style }: { geometry: RoomGeometry; style?: StyleGuide }) {
  const palette = style?.palette ?? ['#e8e2d6', '#cfc4b0', '#7c6a56'];
  const tempK = style?.lightingTempK ?? 3000;
  // Warmer light for low Kelvin, cooler for high.
  const lightColor = tempK < 3500 ? '#ffe9c7' : tempK > 5000 ? '#dce8ff' : '#fff4e0';
  return (
    <div style={{ width: '100%', height: 320, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: '#0a0a0a' }}>
      <Canvas camera={{ position: [geometry.floor.widthM * 0.9, geometry.wallHeightM * 1.4, geometry.floor.depthM * 0.9], fov: 50 }} shadows dpr={[1, 2]}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.1} color={lightColor} castShadow />
        <Suspense fallback={null}>
          <Room geometry={geometry} palette={palette} />
          <Environment preset="apartment" />
        </Suspense>
        <OrbitControls enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
    </div>
  );
}
