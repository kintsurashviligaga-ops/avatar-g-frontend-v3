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

import React, { useEffect, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { getOwnerId } from '@/lib/auth/identity';

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

        // Check session cache first (avoid duplicate fetches)
        const cachedAvatar = sessionStorage?.getItem(`avatar_${ownerId}`);
        if (cachedAvatar) {
          const avatar = JSON.parse(cachedAvatar);
          setLoadingState({
            isLoading: false,
            hasUserAvatar: true,
            userAvatar: avatar,
            error: null,
          });
          return;
        }

        // Fetch latest avatar from Supabase with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(`/api/avatars/latest?owner_id=${encodeURIComponent(ownerId)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Failed: ${response.status}`);

        const data = await response.json();
        const avatar = data?.data?.avatar || null;

        // Cache to session storage
        if (avatar && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(`avatar_${ownerId}`, JSON.stringify(avatar));
        }

        if (avatar) {
          setLoadingState({
            isLoading: false,
            hasUserAvatar: true,
            userAvatar: avatar,
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
        const message = error instanceof Error ? error.message : 'Failed to load avatar';
        
        // Don't show error for timeouts or aborts - just show default
        if (message.includes('abort')) {
          setLoadingState({
            isLoading: false,
            hasUserAvatar: false,
            userAvatar: null,
            error: null,
          });
        } else {
          console.error('Failed to load user avatar:', error);
          setLoadingState({
            isLoading: false,
            hasUserAvatar: false,
            userAvatar: null,
            error: null, // Don't show error UI - fallback silently
          });
        }
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
