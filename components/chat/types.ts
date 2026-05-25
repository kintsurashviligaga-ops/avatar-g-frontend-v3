/**
 * Shared chat domain types — the single source of truth consumed by the
 * MyAvatarChat container and its extracted presentational children
 * (MessageList, ChatComposer, AvatarVideoStage). Previously defined inline in the
 * 3.3k-line monolith; hoisted here as part of the Roadmap #12 decomposition.
 */

import type { RoomGeometry, StyleGuide } from '@/lib/orchestrator/interior';

export type ServiceId =
  | 'chat'
  | 'avatar'
  | 'image'
  | 'video'
  | 'music'
  | 'voice'
  | 'interior'
  | 'app';

export type Mode = 'ask' | 'imagine';

export type ViewId = 'chat' | 'avatar' | 'voice' | 'memory' | 'analytics' | 'billing';

export type Locale = 'ka' | 'en' | 'ru';

/**
 * Truthful per-asset render metadata — populated by the runner from the exact
 * parameters the generation actually used (never fabricated). Drives the dynamic
 * meta-chips in InlineMedia.
 */
export interface RenderMeta {
  fps?: number;
  resolution?: string;     // e.g. "1920x1080"
  aspectRatio?: string;    // e.g. "16:9"
  duckingPct?: number;     // 0–100, music attenuation under vocals
  voiceProvider?: string;  // e.g. "ElevenLabs"
  engine?: string;         // producing engine, e.g. "LTX-2"
}

export interface MediaPayload {
  kind: 'image' | 'video' | 'audio' | 'code' | 'room';
  url?: string;
  /** Interior service: extracted geometry + style → inline Three.js RoomViewer. */
  room?: { geometry: RoomGeometry; style?: StyleGuide };
  html?: string;
  language?: string;
  poster?: string;        // Optional thumbnail/poster for video.
  meta?: RenderMeta;      // truthful render parameters → InlineMedia meta-chips
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  service?: ServiceId;
  media?: MediaPayload;
  /** Data URL of an image the USER attached — rendered inline in their bubble. */
  userImage?: string;
  ts: number;
  liked?: boolean;
  disliked?: boolean;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  ts: number;
  messageCount: number;
}
