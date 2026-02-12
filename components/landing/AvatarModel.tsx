'use client';

/**
 * Avatar Model Component
 * Renders user-created avatar or default placeholder
 * Features:
 * - 360° slow rotation
 * - Breathing idle animation
 * - Float hover motion
 * - Rim glow effect
 */

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { colors } from '@/lib/design/tokens';

interface UserAvatar {
  id: string;
  owner_id: string;
  model_url?: string;
  preview_image_url?: string;
  created_at: string;
}

interface AvatarModelProps {
  userAvatar: UserAvatar | null;
}

// Default placeholder avatar mesh
function DefaultAvatarMesh() {
  const groupRef = useRef<THREE.Group>(null);
  const time = useRef(0);

  // Create simple avatar sphere with rim glow
  useEffect(() => {
    if (!groupRef.current) return;

    // Main avatar head
    const headGeometry = new THREE.SphereGeometry(1, 64, 64);
    const headMaterial = new THREE.MeshPhongMaterial({
      color: new THREE.Color(colors.primary.from),
      emissive: new THREE.Color(colors.primary.from),
      emissiveIntensity: 0.3,
      shininess: 100,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.scale.set(1, 1.1, 1); // Slight oval shape
    groupRef.current.add(head);

    // Rim light glow
    const rimGeometry = new THREE.SphereGeometry(1.05, 64, 64);
    const rimMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colors.accent.purple),
      transparent: true,
      opacity: 0.2,
    });
    const rimLight = new THREE.Mesh(rimGeometry, rimMaterial);
    rimLight.renderOrder = -1;
    groupRef.current.add(rimLight);

    return () => {
      headGeometry.dispose();
      headMaterial.dispose();
      rimGeometry.dispose();
      rimMaterial.dispose();
    };
  }, []);

  // Animation loop  
  useFrame(() => {
    if (!groupRef.current) return;

    time.current += 0.005;

    // 360° slow rotation
    groupRef.current.rotation.y = time.current * 0.5;

    // Enhanced breathing animation with multiple waves
    const breathing = Math.sin(time.current * 2) * 0.05 + Math.sin(time.current * 0.8) * 0.02;
    groupRef.current.scale.set(1, 1 + breathing, 1);

    // Float hover motion with sinusoidal waves
    const floatY = Math.sin(time.current * 1.5) * 0.3 + Math.sin(time.current * 0.7) * 0.15;
    groupRef.current.position.y = floatY;

    // Subtle head tilt
    const tilt = Math.sin(time.current * 0.5) * 0.15;
    groupRef.current.rotation.z = tilt;

    // Gentle wobble side-to-side
    const wobble = Math.sin(time.current * 1.2) * 0.1;
    groupRef.current.position.x = wobble;
  });

  return <group ref={groupRef} />;
}

// Load user avatar from GLB/VRM
function LoadedAvatarModel({ modelUrl }: { modelUrl: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const time = useRef(0);
  const gltf = useGLTF(modelUrl) as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };
  const { actions } = useAnimations(gltf.animations, groupRef);
  const modelScene = useMemo(() => gltf.scene, [gltf.scene]);

  useEffect(() => {
    modelScene.scale.set(1.5, 1.5, 1.5);
  }, [modelScene]);

  useEffect(() => {
    const firstAction = Object.values(actions || {})[0];
    firstAction?.play();
    return () => {
      firstAction?.stop();
    };
  }, [actions]);

  useFrame(() => {
    if (!groupRef.current) return;

    time.current += 0.005;

    // 360° slow rotation
    groupRef.current.rotation.y = time.current * 0.5;

    // Enhanced breathing animation with multiple waves
    const breathing = Math.sin(time.current * 2) * 0.05 + Math.sin(time.current * 0.8) * 0.02;
    groupRef.current.scale.set(1.5, 1.5 + breathing * 1.5, 1.5);

    // Float hover motion with sinusoidal waves
    const floatY = Math.sin(time.current * 1.5) * 0.3 + Math.sin(time.current * 0.7) * 0.15;
    groupRef.current.position.y = floatY;

    // Subtle head tilt
    const tilt = Math.sin(time.current * 0.5) * 0.1;
    groupRef.current.rotation.z = tilt;

    // Gentle wobble side-to-side
    const wobble = Math.sin(time.current * 1.2) * 0.08;
    groupRef.current.position.x = wobble;
  });

  return (
    <group ref={groupRef}>
      <primitive object={modelScene} />
    </group>
  );
}

export default function AvatarModel({ userAvatar }: AvatarModelProps) {
  return (
    <group position={[0, 0, 0]}>
      {userAvatar?.model_url ? (
        <Suspense fallback={<DefaultAvatarMesh />}>
          <LoadedAvatarModel modelUrl={userAvatar.model_url} />
        </Suspense>
      ) : (
        <DefaultAvatarMesh />
      )}
    </group>
  );
}
