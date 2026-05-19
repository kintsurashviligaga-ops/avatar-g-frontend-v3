import type { ServiceConfig, ServiceId } from './types';

/**
 * Per-agent capability declarations. Single source of truth read by:
 *   - orchestrator.ts  → routing + timeout selection + token budget
 *   - actions.ts       → label localization for SuggestedAction.label
 *   - SystemStatus UI  → cost estimates / latency hints
 *   - billing flows    → credit-cost preview
 */
export const SERVICE_CONFIGS: Record<ServiceId, ServiceConfig> = {
  chat: {
    id: 'chat',
    label_ka: 'ჩატი',
    label_en: 'Chat',
    accepts: ['text', 'image'],
    produces: 'text',
    typicalLatencyMs: 2000,
    timeoutMs: 60_000,
    creditsCost: 1,
    abortable: true,
  },
  image: {
    id: 'image',
    label_ka: 'სურათი',
    label_en: 'Image',
    accepts: ['text'],
    produces: 'image',
    typicalLatencyMs: 15_000,
    timeoutMs: 60_000,
    creditsCost: 5,
    abortable: true,
  },
  video: {
    id: 'video',
    label_ka: 'ვიდეო',
    label_en: 'Video',
    accepts: ['text', 'image'],
    produces: 'video',
    typicalLatencyMs: 45_000,
    timeoutMs: 120_000,
    creditsCost: 30,
    abortable: true,
  },
  music: {
    id: 'music',
    label_ka: 'მუსიკა',
    label_en: 'Music',
    accepts: ['text'],
    produces: 'audio',
    typicalLatencyMs: 60_000,
    timeoutMs: 120_000,
    creditsCost: 10,
    abortable: true,
  },
  voice: {
    id: 'voice',
    label_ka: 'ხმა',
    label_en: 'Voice',
    accepts: ['text'],
    produces: 'audio',
    typicalLatencyMs: 4000,
    timeoutMs: 60_000,
    creditsCost: 2,
    abortable: true,
  },
  avatar: {
    id: 'avatar',
    label_ka: 'ავატარი',
    label_en: 'Avatar',
    accepts: ['text', 'image'],
    produces: 'video',
    typicalLatencyMs: 180_000,
    timeoutMs: 300_000,
    creditsCost: 50,
    abortable: true,
  },
  interior: {
    id: 'interior',
    label_ka: 'ინტერიერი',
    label_en: 'Interior',
    accepts: ['text'],
    produces: 'image',
    typicalLatencyMs: 15_000,
    timeoutMs: 60_000,
    creditsCost: 5,
    abortable: true,
  },
  app: {
    id: 'app',
    label_ka: 'აპლიკაცია',
    label_en: 'App',
    accepts: ['text'],
    produces: 'code',
    typicalLatencyMs: 12_000,
    timeoutMs: 120_000,
    creditsCost: 8,
    abortable: true,
  },
};

export function serviceConfig(id: ServiceId): ServiceConfig {
  const cfg = SERVICE_CONFIGS[id];
  if (!cfg) throw new Error(`unknown service id: ${id}`);
  return cfg;
}
