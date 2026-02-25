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
    const payload = (await response.json()) as CoreAvatarResponse;
    return payload;
  } catch {
    return null;
  }
}

function computeCameraSettings(modelViewer: HTMLElement): {
  cameraTarget: string;
  cameraOrbit: string;
  fieldOfView: string;
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
      fieldOfView: '28deg',
    };
  }

  const maxDim = Math.max(dimensions.x, dimensions.y, dimensions.z, 1);
  const orbitDistance = (maxDim * 2.1).toFixed(2);
  const targetY = Math.max(center.y - dimensions.y * 0.08, 0.35).toFixed(2);

  return {
    cameraTarget: `${center.x.toFixed(2)}m ${targetY}m ${center.z.toFixed(2)}m`,
    cameraOrbit: `0deg 78deg ${orbitDistance}m`,
    fieldOfView: '26deg',
  };
}

export function CoreAvatar({ className, pollMs = 4000 }: CoreAvatarProps) {
  const [data, setData] = useState<CoreAvatarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);

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

    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
    script.setAttribute('data-model-viewer', 'true');
    script.onload = () => setViewerReady(true);
    document.head.appendChild(script);

    return () => {
      setViewerReady(false);
    };
  }, [data?.model_glb_url]);

  const modelViewerProps = useMemo(() => {
    if (!data?.model_glb_url) return null;

    return {
      src: data.model_glb_url,
      poster: data.poster_url ?? '/brand/logo.png',
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
    }, 400);

    return () => clearTimeout(timer);
  }, [viewerReady, data?.model_glb_url]);

  if (loading) {
    return (
      <div className={`flex h-36 w-36 items-center justify-center rounded-full border border-white/10 bg-white/5 ${className ?? ''}`}>
        <span className="text-xs text-slate-300">Loading...</span>
      </div>
    );
  }

  if (!data || data.status === 'none' || !data.core_avatar_id) {
    return (
      <div className={`flex h-36 w-36 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 text-4xl font-bold text-cyan-200 ${className ?? ''}`}>
        G
      </div>
    );
  }

  if (data.status === 'processing') {
    return (
      <div className={`flex h-36 w-36 flex-col items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-500/10 ${className ?? ''}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        <p className="mt-3 text-xs text-cyan-100">Generating...</p>
      </div>
    );
  }

  if (data.status === 'ready' && data.model_glb_url && modelViewerProps && viewerReady) {
    return (
      <div className={`h-36 w-36 overflow-hidden rounded-full border border-cyan-400/50 bg-black ${className ?? ''}`}>
        {createElement('model-viewer', {
          id: 'core-avatar-model-viewer',
          ...modelViewerProps,
        })}
      </div>
    );
  }

  return (
    <div className={`relative h-36 w-36 overflow-hidden rounded-full border border-white/15 bg-white/5 ${className ?? ''}`}>
      <Image
        src={data.poster_url ?? '/brand/logo.png'}
        alt="Core avatar poster"
        fill
        sizes="144px"
        className="object-cover"
      />
    </div>
  );
}
