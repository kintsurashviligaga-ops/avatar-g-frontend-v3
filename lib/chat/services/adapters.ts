/**
 * lib/chat/services/adapters.ts
 * Service adapter layer — translates chat intents into service actions,
 * normalizes outputs into ResultCards.
 *
 * Each adapter:
 * - Translates chat intent → service payload
 * - Normalizes service output → ResultCard
 * - Returns next-step metadata
 * - Reports failure gracefully
 */

import type { ResultCard, ResultType, SuggestionChip } from '../types';
import { mapToResultCard, type RawApiResult } from '../logic/resultMapper';

// ─── Base Adapter Interface ──────────────────────────────────────────────────

export interface ServiceAdapterInput {
  intent: string;
  text: string;
  agentId: string;
  attachments?: Array<{ type: string; url?: string; fileName?: string }>;
  projectId?: string;
  language: string;
}

export interface ServiceAdapterOutput {
  result: ResultCard;
  nextSteps: SuggestionChip[];
  error?: string;
}

export interface ServiceAdapter {
  serviceSlug: string;
  agentId: string;
  resultType: ResultType;
  /** Translate chat input into a normalized result card from raw API response */
  normalizeOutput(raw: RawApiResult): ServiceAdapterOutput;
  /** Get the suggested next services after this one completes */
  getNextServices(): string[];
}

// ─── Avatar Adapter ──────────────────────────────────────────────────────────

const avatarAdapter: ServiceAdapter = {
  serviceSlug: 'avatar',
  agentId: 'avatar-agent',
  resultType: 'avatar',
  normalizeOutput(raw) {
    const result = mapToResultCard(raw, 'avatar-agent', 'avatar');
    return {
      result,
      nextSteps: [
        { label: 'Generate Video', action: 'Create a video with this avatar', icon: '🎬', variant: 'secondary' },
        { label: 'Create Poster', action: 'Make a poster with this avatar', icon: '🖼️', variant: 'secondary' },
        { label: 'Add to Store', action: 'Use this avatar in a store listing', icon: '🏪', variant: 'secondary' },
      ],
    };
  },
  getNextServices: () => ['video', 'image', 'store'],
};

// ─── Video Adapter ───────────────────────────────────────────────────────────

const videoAdapter: ServiceAdapter = {
  serviceSlug: 'video',
  agentId: 'video-agent',
  resultType: 'video',
  normalizeOutput(raw) {
    const result = mapToResultCard(raw, 'video-agent', 'video');
    return {
      result,
      nextSteps: [
        { label: 'Add Music', action: 'Add music to this video', icon: '🎵', variant: 'secondary' },
        { label: 'Add Captions', action: 'Add subtitles to this video', icon: '💬', variant: 'secondary' },
        { label: 'Make Reels', action: 'Create social media reels', icon: '📱', variant: 'secondary' },
        { label: 'Make Thumbnail', action: 'Create a thumbnail', icon: '📐', variant: 'secondary' },
      ],
    };
  },
  getNextServices: () => ['music', 'subtitle', 'reels', 'thumbnail'],
};

// ─── Image Adapter ───────────────────────────────────────────────────────────

const imageAdapter: ServiceAdapter = {
  serviceSlug: 'image',
  agentId: 'image-agent',
  resultType: 'image',
  normalizeOutput(raw) {
    const result = mapToResultCard(raw, 'image-agent', 'image');
    return {
      result,
      nextSteps: [
        { label: 'Make Thumbnail', action: 'Create a thumbnail from this', icon: '📐', variant: 'secondary' },
        { label: 'Add to Store', action: 'Use this image for a store listing', icon: '🏪', variant: 'secondary' },
        { label: 'Generate Video', action: 'Create a video from this image', icon: '🎬', variant: 'secondary' },
      ],
    };
  },
  getNextServices: () => ['video', 'store', 'thumbnail', 'marketing'],
};

// ─── Music Adapter ───────────────────────────────────────────────────────────

const musicAdapter: ServiceAdapter = {
  serviceSlug: 'music',
  agentId: 'music-agent',
  resultType: 'music',
  normalizeOutput(raw) {
    const result = mapToResultCard(raw, 'music-agent', 'music');
    return {
      result,
      nextSteps: [
        { label: 'Create Video', action: 'Generate a video with this music', icon: '🎬', variant: 'secondary' },
        { label: 'Add to Reels', action: 'Use this music in social reels', icon: '📱', variant: 'secondary' },
      ],
    };
  },
  getNextServices: () => ['video', 'subtitle', 'reels'],
};

// ─── Subtitle Adapter ────────────────────────────────────────────────────────

const subtitleAdapter: ServiceAdapter = {
  serviceSlug: 'subtitle',
  agentId: 'subtitle-agent',
  resultType: 'subtitle-set',
  normalizeOutput(raw) {
    const result = mapToResultCard(raw, 'subtitle-agent', 'subtitle-set');
    return {
      result,
      nextSteps: [
        { label: 'Apply to Video', action: 'Apply subtitles to the video', icon: '🎬', variant: 'secondary' },
        { label: 'Export SRT', action: 'Export subtitles as SRT file', icon: '📤', variant: 'secondary' },
      ],
    };
  },
  getNextServices: () => ['video', 'reels'],
};

// ─── Store Adapter ───────────────────────────────────────────────────────────

const storeAdapter: ServiceAdapter = {
  serviceSlug: 'shop',
  agentId: 'store-agent',
  resultType: 'product-listing',
  normalizeOutput(raw) {
    const result = mapToResultCard(raw, 'store-agent', 'product-listing');
    return {
      result,
      nextSteps: [
        { label: 'SEO Optimize', action: 'Optimize this listing for SEO', icon: '🔍', variant: 'secondary' },
        { label: 'Affiliate Setup', action: 'Set up affiliate tracking', icon: '🤝', variant: 'secondary' },
        { label: 'Product Image', action: 'Generate a product image', icon: '🖼️', variant: 'secondary' },
      ],
    };
  },
  getNextServices: () => ['seo', 'affiliate', 'image'],
};

// ─── Business Adapter ────────────────────────────────────────────────────────

const businessAdapter: ServiceAdapter = {
  serviceSlug: 'business',
  agentId: 'business-agent',
  resultType: 'business-plan',
  normalizeOutput(raw) {
    const result = mapToResultCard(raw, 'business-agent', 'business-plan');
    return {
      result,
      nextSteps: [
        { label: 'Revenue Plan', action: 'Create a revenue projection plan', icon: '💰', variant: 'secondary' },
        { label: 'Risk Scan', action: 'Run a risk assessment', icon: '🛡️', variant: 'secondary' },
        { label: 'Executive Summary', action: 'Generate executive summary', icon: '📋', variant: 'secondary' },
      ],
    };
  },
  getNextServices: () => ['revenue', 'risk', 'executive'],
};

// ─── Dev Adapter ─────────────────────────────────────────────────────────────

const devAdapter: ServiceAdapter = {
  serviceSlug: 'dev',
  agentId: 'dev-agent',
  resultType: 'app-spec',
  normalizeOutput(raw) {
    const result = mapToResultCard(raw, 'dev-agent', 'app-spec');
    return {
      result,
      nextSteps: [
        { label: 'Task Breakdown', action: 'Break this into development tasks', icon: '📋', variant: 'secondary' },
        { label: 'Business Plan', action: 'Create a business plan', icon: '📊', variant: 'secondary' },
      ],
    };
  },
  getNextServices: () => ['business'],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const ADAPTERS: ServiceAdapter[] = [
  avatarAdapter,
  videoAdapter,
  imageAdapter,
  musicAdapter,
  subtitleAdapter,
  storeAdapter,
  businessAdapter,
  devAdapter,
];

export function getServiceAdapter(slug: string): ServiceAdapter | undefined {
  return ADAPTERS.find(a => a.serviceSlug === slug);
}

export function getAdapterByAgent(agentId: string): ServiceAdapter | undefined {
  return ADAPTERS.find(a => a.agentId === agentId);
}
