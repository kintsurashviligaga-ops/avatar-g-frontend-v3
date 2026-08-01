import { IMAGE_PRIMARY_MODEL_KEY } from '@/lib/video/modelLock';

export type ServiceType = 'avatar' | 'image' | 'photo' | 'video' | 'music' | 'visual-ai';
export type QualityTier = 'standard' | 'high' | 'ultra';

export interface ModelSpec {
  id: string;
  label: string;
  outputType: 'image' | 'video' | 'audio' | 'text';
}

const MODELS = {
  // ── Avatar ──────────────────────────────────────────────
  'sdxl': {
    id: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    label: 'Stability SDXL',
    outputType: 'image' as const,
  },
  // BARE SLUGS, NOT PINNED HASHES. Both entries carried version hashes that 404 on
  // GET /v1/models/{o}/{n}/versions/{id}: `lucataco/instant-id` no longer exists as a MODEL at all
  // (404 "Model not found."), and the face-to-many hash shares only a 25-char prefix with the real one
  // (a07f252abbbd832009640b27f063ea52…) — i.e. it was never a real version. createPrediction resolves a
  // bare slug to the model's current latest_version, so these can no longer rot.
  'instant-id': {
    id: 'zsxkib/instant-id',
    label: 'Instant ID',
    outputType: 'image' as const,
  },
  'face-to-many': {
    id: 'fofr/face-to-many',
    label: 'Face to Many',
    outputType: 'image' as const,
  },

  // ── Image ───────────────────────────────────────────────
  'flux': {
    id: 'black-forest-labs/flux-schnell',
    label: 'FLUX Schnell',
    outputType: 'image' as const,
  },
  'flux-pro': {
    id: 'black-forest-labs/flux-1.1-pro',
    label: 'FLUX 1.1 Pro',
    outputType: 'image' as const,
  },
  // Bare slug: the pinned hash 2c835e46… 404s (the model's real latest is 2c8e954decbf…), so the IMAGE
  // service's `realistic` variant failed on every call. Let createPrediction resolve latest_version.
  'realistic-vision': {
    id: 'lucataco/realistic-vision-v5.1',
    label: 'Realistic Vision',
    outputType: 'image' as const,
  },

  // ── Photo ───────────────────────────────────────────────
  'real-esrgan': {
    id: 'nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
    label: 'Real-ESRGAN Upscale',
    outputType: 'image' as const,
  },
  'rembg': {
    id: 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
    label: 'Remove Background',
    outputType: 'image' as const,
  },

  // ── Video ───────────────────────────────────────────────
  'stable-video': {
    id: 'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438',
    label: 'Stable Video Diffusion',
    outputType: 'video' as const,
  },
  'zeroscope': {
    id: 'anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351',
    label: 'Zeroscope V2',
    outputType: 'video' as const,
  },

  // ── Music ───────────────────────────────────────────────
  'musicgen': {
    id: 'meta/musicgen',
    label: 'Meta MusicGen',
    outputType: 'audio' as const,
  },

  // ── Visual AI ───────────────────────────────────────────
  'blip': {
    id: 'salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746',
    label: 'BLIP Captioning',
    outputType: 'text' as const,
  },
} as const;

type ModelKey = keyof typeof MODELS;

export interface RouteConfig {
  defaultModel: ModelKey;
  variants: Record<string, ModelKey>;
  outputType: 'image' | 'video' | 'audio' | 'text';
}

const SERVICE_ROUTES: Record<ServiceType, RouteConfig> = {
  avatar: {
    defaultModel: 'sdxl',
    variants: {
      fast: 'sdxl',
      realistic: 'sdxl',
      identity: 'instant-id',
      stylized: 'face-to-many',
    },
    outputType: 'image',
  },
  image: {
    // V8-F2 — FLUX 1.1 Pro hard-locked as the PRIMARY production path (was flux-schnell).
    // 'fast' stays the deliberate cheap/quick escape (schnell); premium/ultra already pro.
    // ⚠️ COST: flux-1.1-pro ≈ $0.04/img vs schnell ≈ $0.003 — credit pricing (lib/credits/pricing)
    // must be reconciled by the founder before this is load-bearing on margin.
    // Wired to the SSoT constant so the V8 image lock is enforced here, not just documented.
    defaultModel: IMAGE_PRIMARY_MODEL_KEY,
    variants: {
      fast:      'flux',
      general:   'flux-pro',
      premium:   'flux-pro',
      ultra:     'flux-pro',
      realistic: 'realistic-vision',
    },
    outputType: 'image',
  },
  photo: {
    defaultModel: 'real-esrgan',
    variants: {
      upscale: 'real-esrgan',
      'remove-bg': 'rembg',
      enhance: 'real-esrgan',
    },
    outputType: 'image',
  },
  video: {
    defaultModel: 'zeroscope',
    variants: {
      cinematic: 'stable-video',
      'text-to-video': 'zeroscope',
      motion: 'stable-video',
    },
    outputType: 'video',
  },
  music: {
    defaultModel: 'musicgen',
    variants: {
      beat: 'musicgen',
      soundtrack: 'musicgen',
      instrumental: 'musicgen',
    },
    outputType: 'audio',
  },
  'visual-ai': {
    defaultModel: 'blip',
    variants: {
      caption: 'blip',
      analysis: 'blip',
      quality: 'blip',
    },
    outputType: 'text',
  },
};

export interface QualityParams {
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  scale?: number;
  duration?: number;
}

const QUALITY_PRESETS: Record<QualityTier, QualityParams> = {
  standard: { width: 512, height: 512, num_inference_steps: 15, guidance_scale: 7, scale: 2, duration: 8 },
  high: { width: 1024, height: 1024, num_inference_steps: 30, guidance_scale: 7.5, scale: 4, duration: 15 },
  ultra: { width: 1024, height: 1024, num_inference_steps: 50, guidance_scale: 8, scale: 4, duration: 30 },
};

export function resolveModel(service: ServiceType, variant?: string): ModelSpec {
  const route = SERVICE_ROUTES[service];
  const key = (variant && route.variants[variant]) || route.defaultModel;
  return MODELS[key];
}

export function getQualityParams(quality: QualityTier = 'high'): QualityParams {
  return QUALITY_PRESETS[quality];
}

export function getServiceRoute(service: ServiceType): RouteConfig {
  return SERVICE_ROUTES[service];
}

export function isValidService(s: string): s is ServiceType {
  return s in SERVICE_ROUTES;
}
