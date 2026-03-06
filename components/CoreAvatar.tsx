'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

type CoreAvatarResponse = {
  core_avatar_id: string | null;
  status: 'none' | 'processing' | 'ready' | 'failed';
  model_glb_url: string | null;
  poster_url: string | null;
  updated_at: string | null;
};

type CoreAvatarProps = {
  className?: string;
  pollMs?: number;
};

async function fetchCoreAvatar(): Promise<CoreAvatarResponse | null> {
  try {
    const response = await fetch('/api/avatar/core', { cache: 'no-store' });
    if (!response.ok) return null;
    const json = (await response.json()) as { status: string; data?: CoreAvatarResponse };
    // apiSuccess wraps payload in { status, data, timestamp } — unwrap
    return (json.data as CoreAvatarResponse) ?? null;
  } catch {
    return null;
  }
}

function computeCameraSettings(modelViewer: HTMLElement): {
  cameraTarget: string;
  cameraOrbit: string;
  fieldOfView: string;
  minCameraOrbit: string;
  maxCameraOrbit: string;
} {
  const anyViewer = modelViewer as unknown as {
    model?: {
      getBoundingBoxCenter?: () => { x: number; y: number; z: number };
      getDimensions?: () => { x: number; y: number; z: number };
    };
  };

  const center = anyViewer.model?.getBoundingBoxCenter?.();
  const dimensions = anyViewer.model?.getDimensions?.();

  if (!center || !dimensions) {
    return {
      cameraTarget: '0m 0.85m 0m',
      cameraOrbit: '0deg 78deg 2.8m',
      fieldOfView: '30deg',
      minCameraOrbit: 'auto 60deg auto',
      maxCameraOrbit: 'auto 90deg auto',
    };
  }

  const height = Math.max(dimensions.y, 0.5);
  const targetY = (height * 0.52).toFixed(2);
  const radius = Math.max(2.3, height * 1.9).toFixed(2);

  return {
    cameraTarget: `${center.x.toFixed(2)}m ${targetY}m ${center.z.toFixed(2)}m`,
    cameraOrbit: `0deg 78deg ${radius}m`,
    fieldOfView: '30deg',
    minCameraOrbit: 'auto 60deg auto',
    maxCameraOrbit: 'auto 90deg auto',
  };
}

export function CoreAvatar({ className, pollMs = 4000 }: CoreAvatarProps) {
  const [data, setData] = useState<CoreAvatarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      const payload = await fetchCoreAvatar();
      if (!isMounted) return;
      setData(payload);
      setLoading(false);

      if (payload?.status === 'processing') {
        timer = setTimeout(load, pollMs);
      }
    };

    void load();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [pollMs]);

  useEffect(() => {
    if (!data?.model_glb_url) return;

    const existing = document.querySelector('script[data-model-viewer="true"]');
    if (existing) {
      setViewerReady(true);
      return;
    }

    try {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
      script.setAttribute('data-model-viewer', 'true');
      script.onload = () => setViewerReady(true);
      script.onerror = () => {
        console.warn('[CoreAvatar] model-viewer script failed to load');
        setScriptFailed(true);
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('[CoreAvatar] model-viewer script injection failed', e);
      setScriptFailed(true);
    }

    return () => {
      setViewerReady(false);
    };
  }, [data?.model_glb_url]);

  const modelViewerProps = useMemo(() => {
    if (!data?.model_glb_url) return null;

    return {
      src: data.model_glb_url,
      poster: data.poster_url ?? '/brand/logo-primary-transparent.png',
      style: { width: '100%', height: '100%', background: '#060B18', borderRadius: '999px' },
      ar: true,
      autoplay: true,
      'camera-controls': true,
      'auto-rotate': true,
      'shadow-intensity': 1,
      loading: 'eager',
      reveal: 'auto',
    } as Record<string, unknown>;
  }, [data?.model_glb_url, data?.poster_url]);

  useEffect(() => {
    if (!viewerReady || !data?.model_glb_url) return;

    const timer = setTimeout(() => {
      const viewer = document.getElementById('core-avatar-model-viewer');
      if (!viewer) return;
      const settings = computeCameraSettings(viewer);
      viewer.setAttribute('camera-target', settings.cameraTarget);
      viewer.setAttribute('camera-orbit', settings.cameraOrbit);
      viewer.setAttribute('field-of-view', settings.fieldOfView);
      viewer.setAttribute('min-camera-orbit', settings.minCameraOrbit);
      viewer.setAttribute('max-camera-orbit', settings.maxCameraOrbit);
    }, 400);

    return () => clearTimeout(timer);
  }, [viewerReady, data?.model_glb_url]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center rounded-full border border-white/10 bg-white/5 ${className ?? 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40'}`}>
        <span className="text-xs text-slate-300">Loading...</span>
      </div>
    );
  }

  if (!data || data.status === 'none' || !data.core_avatar_id) {
    return (
      <div className={`flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 text-4xl font-bold text-cyan-200 ${className ?? 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40'}`}>
        G
      </div>
    );
  }

  if (data.status === 'processing') {
    return (
      <div className={`flex flex-col items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-500/10 ${className ?? 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40'}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        <p className="mt-3 text-xs text-cyan-100">Generating...</p>
      </div>
    );
  }

  if (data.status === 'ready' && data.model_glb_url && modelViewerProps && viewerReady && !scriptFailed) {
    try {
      return (
        <div className={`overflow-hidden rounded-full border border-cyan-400/50 bg-black ${className ?? 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40'}`}>
          {createElement('model-viewer', {
            id: 'core-avatar-model-viewer',
            ...modelViewerProps,
          })}
        </div>
      );
    } catch (e) {
      console.warn('[CoreAvatar] model-viewer render failed, using poster fallback', e);
      // Fall through to poster/fallback below
    }
  }

  return (
    <div className={`relative overflow-hidden rounded-full border border-white/15 bg-white/5 ${className ?? 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40'}`}>
      <Image
        src={data.poster_url ?? '/brand/logo-primary-transparent.png'}
        alt="Core avatar poster"
        fill
        sizes="144px"
        className="object-cover"
      />
    </div>
  );
}
