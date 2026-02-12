'use client';

/**
 * Cinematic Landing Hero with 3D Avatar + Orbiting Services
 * 
 * Features:
 * - Center 360° rotating avatar with breathing animation
 * - User-created avatar auto-load from Supabase
 * - Orbiting service icons in 3D space
 * - Cinematic space background with particles
 * - Hover effects and glassmorphism
 */

import React, { useEffect, useRef, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { getOwnerId } from '@/lib/auth/identity';
import { colors, spacing } from '@/lib/design/tokens';

// Lazy load Three.js components
const CinematicScene = dynamic(() => import('./CinematicScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-[#05070A]">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-transparent border-t-cyan-400 border-r-blue-500 animate-spin" />
        <p className="text-cyan-400 font-mono text-sm">Initializing quantum dimension...</p>
      </div>
    </div>
  ),
});

interface UserAvatar {
  id: string;
  owner_id: string;
  model_url?: string;
  preview_image_url?: string;
  created_at: string;
}

interface LoadingState {
  isLoading: boolean;
  hasUserAvatar: boolean;
  userAvatar: UserAvatar | null;
  error: string | null;
}

export default function CinematicHero3D() {
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: true,
    hasUserAvatar: false,
    userAvatar: null,
    error: null,
  });

  // Load user avatar on mount
  useEffect(() => {
    const loadUserAvatar = async () => {
      try {
        // Get owner ID (auth or anon)
        const ownerId = await getOwnerId();

        // Fetch latest avatar from Supabase
        const response = await fetch(`/api/avatars/latest?owner_id=${encodeURIComponent(ownerId)}`);
        const data = await response.json();

        if (data.success && data.avatar) {
          setLoadingState({
            isLoading: false,
            hasUserAvatar: true,
            userAvatar: data.avatar,
            error: null,
          });
        } else {
          setLoadingState({
            isLoading: false,
            hasUserAvatar: false,
            userAvatar: null,
            error: null,
          });
        }
      } catch (error) {
        console.error('Failed to load user avatar:', error);
        setLoadingState({
          isLoading: false,
          hasUserAvatar: false,
          userAvatar: null,
          error: error instanceof Error ? error.message : 'Failed to load avatar',
        });
      }
    };

    loadUserAvatar();
  }, []);

  return (
    <Suspense fallback={<div className="w-full h-screen bg-[#05070A]" />}>
      <CinematicScene userAvatar={loadingState.userAvatar} />
    </Suspense>
  );
}
