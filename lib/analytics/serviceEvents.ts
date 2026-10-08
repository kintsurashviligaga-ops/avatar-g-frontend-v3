/**
 * lib/analytics/serviceEvents.ts — the §50 service funnel, keyed by the canonical catalog id (lib/catalog/services.ts).
 *
 * One name per step, so a dashboard can follow a service from menu to saved result:
 *   category viewed → service opened → quote shown → generation confirmed → completed | failed → result saved.
 * Every event carries `service` (the catalog id, e.g. `video.generate`) or `category`, plus a `surface` saying where it
 * happened. Props are ids, counts and short codes only: never a prompt, file name, URL or user text.
 * Fires through lib/analytics/track.ts (Vercel Web Analytics + the first-party analytics_events log) and inherits its
 * fail-silent rule: tracking never throws into a user flow.
 */
import { track } from '@/lib/analytics/track';
import { SERVICE_CATALOG, type ServiceCategory } from '@/lib/catalog/services';
import type { ToolId } from '@/lib/studio/tools';

export const SERVICE_EVENTS = {
  categoryViewed: 'catalog_category_viewed',
  serviceOpened: 'catalog_service_opened',
  quoteShown: 'service_quote_shown',
  generationConfirmed: 'service_generation_confirmed',
  generationCompleted: 'service_generation_completed',
  generationFailed: 'service_generation_failed',
  resultSaved: 'service_result_saved',
} as const;

export type ServiceEventName = (typeof SERVICE_EVENTS)[keyof typeof SERVICE_EVENTS];

/** Where an event happened. */
export type ServiceSurface =
  | 'sidebar'
  | 'tool-sheet'
  | 'deep-link'
  | 'agent-g'
  | 'voice'
  | 'composer'
  | 'panel'
  | 'agent-card'
  | 'storyboard'
  | 'result'
  | 'library';

/**
 * The catalog service a studio tool stands for. Several services can share a tool: the lowest `order` is the tool's own
 * service (video → video.generate, chat → text.write); a music-video run of the video tool is video.music-video.
 */
export function serviceForTool(tool: ToolId | null | undefined, hint: { videoMode?: string | null } = {}): string | null {
  if (!tool) return null;
  if (tool === 'video' && hint.videoMode === 'musicvideo') return 'video.music-video';
  let best: { id: string; order: number } | null = null;
  for (const s of SERVICE_CATALOG) {
    if (s.tool === tool && (!best || s.order < best.order)) best = { id: s.id, order: s.order };
  }
  return best?.id ?? null;
}

const SHORT_CODE = /^[a-z0-9_.:-]{1,40}$/i;
/** Keep a free-text code short and safe (error kinds, result kinds); anything else becomes 'other'. */
const code = (v: string | null | undefined): string | undefined => (v ? (SHORT_CODE.test(v) ? v : 'other') : undefined);

export function trackCategoryViewed(category: ServiceCategory | 'agent-g', surface: ServiceSurface): void {
  track(SERVICE_EVENTS.categoryViewed, { category, surface });
}

export function trackServiceOpened(service: string | null, surface: ServiceSurface, tool?: ToolId): void {
  if (!service) return;
  track(SERVICE_EVENTS.serviceOpened, { service, surface, ...(tool ? { tool } : {}) });
}

let lastQuote = '';
/** A quote on screen. De-duplicated: the same service at the same price is one event until either changes. */
export function trackQuoteShown(service: string | null, credits: number, surface: ServiceSurface): void {
  if (!service || !Number.isFinite(credits) || credits <= 0) return;
  const key = `${service}|${credits}|${surface}`;
  if (key === lastQuote) return;
  lastQuote = key;
  track(SERVICE_EVENTS.quoteShown, { service, credits, surface });
}

export function trackGenerationConfirmed(service: string | null, surface: ServiceSurface, credits?: number | null): void {
  if (!service) return;
  track(SERVICE_EVENTS.generationConfirmed, { service, surface, ...(typeof credits === 'number' ? { credits } : {}) });
}

export function trackGenerationCompleted(service: string | null, credits?: number | null): void {
  if (!service) return;
  track(SERVICE_EVENTS.generationCompleted, { service, ...(typeof credits === 'number' ? { credits } : {}) });
}

export function trackGenerationFailed(service: string | null, reason?: string | null): void {
  if (!service) return;
  const r = code(reason);
  track(SERVICE_EVENTS.generationFailed, { service, ...(r ? { reason: r } : {}) });
}

export function trackResultSaved(service: string | null, surface: ServiceSurface, kind?: string | null): void {
  if (!service) return;
  const k = code(kind);
  track(SERVICE_EVENTS.resultSaved, { service, surface, ...(k ? { kind: k } : {}) });
}

/** Tests only. */
export function __resetServiceEvents(): void {
  lastQuote = '';
}
