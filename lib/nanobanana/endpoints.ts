export type NanoBananaEndpoint =
  | 'task-details'
  | 'text-to-image'
  | 'pro-1k2k'
  | 'pro-4k'
  | 'v2-1k'
  | 'v2-2k'
  | 'v2-4k';

export const DEFAULT_NANOBANANA_ENDPOINT: NanoBananaEndpoint = 'text-to-image';

export const NANOBANANA_ENDPOINT_COSTS: Record<NanoBananaEndpoint, number> = {
  'task-details': 0,
  'text-to-image': 4,
  'pro-1k2k': 18,
  'pro-4k': 24,
  'v2-1k': 8,
  'v2-2k': 12,
  'v2-4k': 18,
};

export const NANOBANANA_ENDPOINT_LABELS: Record<NanoBananaEndpoint, { en: string; ka: string; ru: string }> = {
  'task-details': {
    en: 'Task Details',
    ka: 'Task დეტალები',
    ru: 'Детали задачи',
  },
  'text-to-image': {
    en: 'Text -> Image',
    ka: 'ტექსტი -> სურათი',
    ru: 'Текст -> изображение',
  },
  'pro-1k2k': {
    en: 'Pro 1K/2K',
    ka: 'Pro 1K/2K',
    ru: 'Pro 1K/2K',
  },
  'pro-4k': {
    en: 'Pro 4K',
    ka: 'Pro 4K',
    ru: 'Pro 4K',
  },
  'v2-1k': {
    en: 'V2 1K',
    ka: 'V2 1K',
    ru: 'V2 1K',
  },
  'v2-2k': {
    en: 'V2 2K',
    ka: 'V2 2K',
    ru: 'V2 2K',
  },
  'v2-4k': {
    en: 'V2 4K',
    ka: 'V2 4K',
    ru: 'V2 4K',
  },
};

const ENDPOINT_ALIASES: Record<string, NanoBananaEndpoint> = {
  'task-details': 'task-details',
  'task-detail': 'task-details',
  task: 'task-details',
  details: 'task-details',
  'text-to-image': 'text-to-image',
  'text-image': 'text-to-image',
  'text2image': 'text-to-image',
  'text->image': 'text-to-image',
  'pro-1k2k': 'pro-1k2k',
  'pro-1k-2k': 'pro-1k2k',
  'pro-1k/2k': 'pro-1k2k',
  'pro_1k_2k': 'pro-1k2k',
  'pro-4k': 'pro-4k',
  'pro4k': 'pro-4k',
  'v2-1k': 'v2-1k',
  'v2_1k': 'v2-1k',
  'v2-2k': 'v2-2k',
  'v2_2k': 'v2-2k',
  'v2-4k': 'v2-4k',
  'v2_4k': 'v2-4k',
};

export function isNanoBananaEndpoint(value: string): value is NanoBananaEndpoint {
  return value in NANOBANANA_ENDPOINT_COSTS;
}

export function resolveNanoBananaEndpoint(value: unknown): NanoBananaEndpoint {
  if (typeof value !== 'string' || !value.trim()) {
    return DEFAULT_NANOBANANA_ENDPOINT;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/--+/g, '-');

  if (isNanoBananaEndpoint(normalized)) {
    return normalized;
  }

  return ENDPOINT_ALIASES[normalized] ?? DEFAULT_NANOBANANA_ENDPOINT;
}

export function getNanoBananaCreditCost(endpoint: unknown): number {
  const resolved = resolveNanoBananaEndpoint(endpoint);
  return NANOBANANA_ENDPOINT_COSTS[resolved];
}

export function isNanoBananaTextEndpoint(endpoint: NanoBananaEndpoint): boolean {
  return endpoint === 'task-details';
}