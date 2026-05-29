'use client';

/**
 * lib/chat/conversationStore.ts
 * =============================
 * Client-side, SSR-safe conversation persistence for the `/dashboard` chat
 * (MyAvatarChatV2). Mirrors the Tier-1 LLM sidebar model: many conversations,
 * each keyed by the `sessionId` we already send to /api/chat/orchestrate, with
 * time-based grouping (Today / Previous 7 Days / Previous 30 Days / Older),
 * auto-titles derived from the first prompt, rename, delete, and instant
 * restoration into the main viewport.
 *
 * Why localStorage (not the DB)?
 *   • Zero backend-migration risk and instant, offline-friendly restoration.
 *   • The orchestrator returns large media as base64 `data:` URLs (a single
 *     video can be ~5MB). Persisting those verbatim would blow the ~5MB quota
 *     in one turn, so we EVICT oversized `data:`/`blob:` assets on write (the
 *     message text + an `assetEvicted` flag survive, so restoration shows the
 *     conversation cleanly and the user can regenerate). Remote http(s) asset
 *     URLs (HeyGen, hosted renders) are kept and restore perfectly.
 *
 * Every function is defensive: it no-ops / returns empty on SSR, malformed
 * JSON, or quota errors so a storage failure can never break the chat.
 */

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  text: string;
  timestamp: number;
  assetUrl?: string | null;
  assetType?: 'image' | 'video' | 'audio' | null;
  sourcePrompt?: string;
  agentId?: string;
  model?: string;
  mode?: string;
  /** Set when a large/ephemeral asset URL was dropped on persistence. */
  assetEvicted?: boolean;
}

export interface StoredConversation {
  /** The sessionId sent to /api/chat/orchestrate — stable per conversation. */
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

export type TimeBucket = 'today' | 'previous7' | 'previous30' | 'older';

export interface ConversationGroup {
  bucket: TimeBucket;
  conversations: StoredConversation[];
}

const STORAGE_KEY = 'myavatar.conversations.v1';
const MAX_CONVERSATIONS = 60;
/** ~150KB. `data:` URLs longer than this are evicted rather than persisted. */
const MAX_INLINE_ASSET_CHARS = 200_000;
const DAY_MS = 86_400_000;

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/** First-prompt → concise title (Tier-1 default before any manual rename). */
export function deriveTitle(text: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
}

/**
 * Drop assets that can't (or shouldn't) survive a reload: oversized base64
 * `data:` URLs and ephemeral `blob:`/object URLs. The message body is kept so
 * the conversation reads correctly; `assetEvicted` lets the UI show a hint.
 */
export function sanitizeMessageForStore(message: StoredMessage): StoredMessage {
  const url = message.assetUrl;
  if (!url) return message;
  const isEphemeralBlob = url.startsWith('blob:');
  const isOversizedData = url.startsWith('data:') && url.length > MAX_INLINE_ASSET_CHARS;
  if (isEphemeralBlob || isOversizedData) {
    return { ...message, assetUrl: null, assetEvicted: true };
  }
  return message;
}

export function sanitizeMessagesForStore(messages: StoredMessage[]): StoredMessage[] {
  return messages.map(sanitizeMessageForStore);
}

export function loadConversations(): StoredConversation[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as StoredConversation[])
      .filter(
        (c): c is StoredConversation =>
          !!c && typeof c.id === 'string' && Array.isArray(c.messages) && typeof c.updatedAt === 'number',
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function persist(list: StoredConversation[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded — shed the oldest half and retry once. Better to keep the
    // most recent conversations than to lose the whole store.
    try {
      const trimmed = list.slice(0, Math.max(1, Math.floor(list.length / 2)));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* give up silently — never throw into the chat */
    }
  }
}

/** Insert or replace a conversation, sanitizing assets and capping the count. */
export function upsertConversation(convo: StoredConversation): StoredConversation[] {
  const sanitized: StoredConversation = {
    ...convo,
    title: convo.title || deriveTitle(convo.messages.find((m) => m.role === 'user')?.text ?? ''),
    messages: sanitizeMessagesForStore(convo.messages),
  };
  const list = loadConversations();
  const idx = list.findIndex((c) => c.id === convo.id);
  if (idx >= 0) list[idx] = sanitized;
  else list.unshift(sanitized);
  const sorted = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
  persist(sorted);
  return sorted;
}

export function deleteConversation(id: string): StoredConversation[] {
  const list = loadConversations().filter((c) => c.id !== id);
  persist(list);
  return list;
}

export function renameConversation(id: string, title: string): StoredConversation[] {
  const list = loadConversations();
  const idx = list.findIndex((c) => c.id === id);
  const current = idx >= 0 ? list[idx] : undefined;
  if (current) {
    const next = title.trim();
    list[idx] = { ...current, title: next || current.title };
    persist(list);
  }
  return list;
}

export function getConversation(id: string): StoredConversation | null {
  return loadConversations().find((c) => c.id === id) ?? null;
}

/** Classify a conversation by its last activity relative to `now`. */
export function bucketFor(updatedAt: number, now: number): TimeBucket {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (updatedAt >= startOfToday.getTime()) return 'today';
  if (updatedAt >= now - 7 * DAY_MS) return 'previous7';
  if (updatedAt >= now - 30 * DAY_MS) return 'previous30';
  return 'older';
}

/**
 * Group conversations into ordered time buckets (most-recent first within each),
 * omitting any empty bucket — exactly the ChatGPT/Claude/Gemini sidebar layout.
 */
export function groupConversationsByTime(
  convos: StoredConversation[],
  now: number = Date.now(),
): ConversationGroup[] {
  const order: TimeBucket[] = ['today', 'previous7', 'previous30', 'older'];
  const map = new Map<TimeBucket, StoredConversation[]>(order.map((b) => [b, []]));
  for (const c of [...convos].sort((a, b) => b.updatedAt - a.updatedAt)) {
    map.get(bucketFor(c.updatedAt, now))!.push(c);
  }
  return order
    .map((bucket) => ({ bucket, conversations: map.get(bucket)! }))
    .filter((group) => group.conversations.length > 0);
}
