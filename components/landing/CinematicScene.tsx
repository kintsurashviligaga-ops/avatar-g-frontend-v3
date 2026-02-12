'use client';

/**
 * Three.js Cinematic Scene
 * Handles:
 * - 3D avatar rendering with animations
 * - Orbiting service icons
 * - Space background effects
 * - WebGL context management and memory cleanup
 */

import React, { useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Preload } from '@react-three/drei';
import { colors } from '@/lib/design/tokens';
import AvatarModel from './AvatarModel';
import OrbitingServices from './OrbitingServices';
import SpaceBackgroundShaders from './SpaceBackgroundShaders';

interface UserAvatar {
  id: string;
  owner_id: string;
  model_url?: string;
  preview_image_url?: string;
  created_at: string;
}

interface CinematicSceneProps {
  userAvatar: UserAvatar | null;
}

export default function CinematicScene({ userAvatar }: CinematicSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cleanup WebGL context on unmount
  useEffect(() => {
    return () => {
      if (canvasRef.current) {
        const gl = canvasRef.current.getContext('webgl2') || canvasRef.current.getContext('webgl');
        if (gl) {
          const loseContext = gl.getExtension('WEBGL_lose_context');
          if (loseContext) loseContext.loseContext();
        }
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-screen overflow-hidden"
      style={{ background: colors.bg.dark }}
    >
      <Canvas
        ref={(instance) => {
          if (instance && instance.domElement) {
            canvasRef.current = instance.domElement as HTMLCanvasElement;
          }
        }}
        camera={{
          position: [0, 0, 8],
          fov: 75,
          near: 0.1,
          far: 1000,
        }}
        style={{
          width: '100%',
          height: '100%',
        }}
        performance={{ min: 0.5 }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} color={colors.primary.from} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#FFFFFF" />
        <pointLight position={[-10, -10, 10]} intensity={0.5} color={colors.accent.purple} />

        {/* Background */}
        <SpaceBackgroundShaders />

        {/* Center Avatar */}
        <AvatarModel userAvatar={userAvatar} />

        {/* Orbiting Service Icons */}
        <OrbitingServices />

        {/* Post-processing and effects */}
        <Preload all />
      </Canvas>
    </div>
  );
}
