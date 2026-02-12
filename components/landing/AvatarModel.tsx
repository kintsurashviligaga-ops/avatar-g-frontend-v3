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

import React, { useEffect, useRef, useState } from 'react';
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
  useFrame((state) => {
    if (!groupRef.current) return;

    time.current += 0.005;

    // 360° slow rotation
    groupRef.current.rotation.y = time.current * 0.5;

    // Breathing animation (scale Y pulse)
    const breathing = Math.sin(time.current * 2) * 0.05;
    groupRef.current.scale.y = 1 + breathing;

    // Float hover motion
    const floatY = Math.sin(time.current * 1.5) * 0.3;
    groupRef.current.position.y = floatY;
  });

  return <group ref={groupRef} />;
}

// Load user avatar from GLB/VRM
function LoadedAvatarModel({ modelUrl }: { modelUrl: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const time = useRef(0);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!modelUrl) return;

    const loadModel = async () => {
      try {
        // Dynamic import loader based on file type
        if (modelUrl.endsWith('.glb') || modelUrl.endsWith('.gltf')) {
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader');
          const loader = new GLTFLoader();

          loader.load(
            modelUrl,
            (gltf) => {
              const loadedModel = gltf.scene;
              loadedModel.scale.set(1.5, 1.5, 1.5);
              setModel(loadedModel);
              setLoading(false);
            },
            undefined,
            (error) => {
              console.error('Error loading avatar model:', error);
              setLoading(false);
            }
          );
        }
      } catch (error) {
        console.error('Error loading model:', error);
        setLoading(false);
      }
    };

    loadModel();
  }, [modelUrl]);

  useEffect(() => {
    if (model && groupRef.current && !groupRef.current.children.includes(model)) {
      groupRef.current.add(model);
    }
  }, [model]);

  useFrame((state) => {
    if (!groupRef.current) return;

    time.current += 0.005;

    // 360° slow rotation
    groupRef.current.rotation.y = time.current * 0.5;

    // Breathing animation
    const breathing = Math.sin(time.current * 2) * 0.05;
    groupRef.current.scale.y = 1 + breathing;

    // Float hover motion
    const floatY = Math.sin(time.current * 1.5) * 0.3;
    groupRef.current.position.y = floatY;
  });

  return (
    <group ref={groupRef}>
      {loading && <DefaultAvatarMesh />}
    </group>
  );
}

export default function AvatarModel({ userAvatar }: AvatarModelProps) {
  return (
    <group position={[0, 0, 0]}>
      {userAvatar?.model_url ? (
        <LoadedAvatarModel modelUrl={userAvatar.model_url} />
      ) : (
        <DefaultAvatarMesh />
      )}
    </group>
  );
}
