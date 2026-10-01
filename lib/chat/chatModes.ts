/**
 * lib/chat/chatModes.ts — the chat MODEL PICKER catalogue (Gemini-style: Fast · Thinking · Pro · Lite).
 *
 * Pure and isomorphic: no imports, no env, no server code — the header dropdown (client) and /api/chat/gemini (server)
 * both read this file, so the menu and the route can never disagree about what a mode is.
 *
 * ⚠️ THE CLIENT SENDS A MODE, NEVER A MODEL ID. The route resolves the mode to its own chain (lib/ai/google/models.ts
 * `chatModelChain`), so a request cannot repoint a turn at an arbitrary (or costlier) model. `displayModel` below is
 * only the menu subtitle; the answering model is reported back in the stream's meta frame and shown with
 * `displayNameFor()`.
 *
 * Why these four (2026-09-30, verified live on the funded key): the names people ask for — "Gemini 1.5 Pro / 1.5 Flash
 * / 1.5 Flash-8B" — are retired (404). Their current equivalents are 3.1 Pro, 3.8 Flash and 3.1 Flash-Lite; "Thinking"
 * is Gemini's own reasoning mode of the same Flash model. Flash-Lite was checked for natural Georgian before shipping.
 */

export type ChatModeId = 'fast' | 'thinking' | 'pro' | 'lite';
export type ChatModeLocale = 'ka' | 'en' | 'ru';

export const CHAT_MODE_IDS: readonly ChatModeId[] = ['fast', 'thinking', 'pro', 'lite'];
export const DEFAULT_CHAT_MODE: ChatModeId = 'fast';
/** Per-viewer choice (localStorage), next to `myavatar:persona`. */
export const CHAT_MODE_STORAGE_KEY = 'myavatar:chat-mode';
/** Window event fired on every change (detail: the new ChatModeId) — keeps the phone and desktop headers in sync. */
export const CHAT_MODE_EVENT = 'myavatar:chat-mode-changed';

export interface ChatModeOption {
  id: ChatModeId;
  /** Menu row title, Gemini-style ("3.8 Flash"). */
  label: string;
  /** The full model name shown on the trigger / tooltip ("Gemini 3.8 Flash"). */
  displayModel: string;
  /** One line under the row title. */
  description: Record<ChatModeLocale, string>;
  /** 'pro' turns also draw on the per-account Pro allowance (CHAT_PRO_USER). */
  quota: 'standard' | 'pro';
  /** The reasoning depth the route applies (overrides a persona's thinking). */
  thinking: 'low' | 'high';
  enabled: boolean;
}

export const CHAT_MODES: readonly ChatModeOption[] = [
  {
    id: 'fast',
    label: '3.8 Flash',
    displayModel: 'Gemini 3.8 Flash',
    description: {
      ka: 'სწრაფი პასუხები ყოველდღიური კითხვებისთვის',
      en: 'Fast all-around help',
      ru: 'Быстрая помощь на каждый день',
    },
    quota: 'standard',
    thinking: 'low',
    enabled: true,
  },
  {
    id: 'thinking',
    label: '3.8 Flash Thinking',
    displayModel: 'Gemini 3.8 Flash Thinking',
    description: {
      ka: 'ფიქრობს პასუხამდე — რთული ამოცანებისთვის',
      en: 'Reasons before answering — for harder problems',
      ru: 'Думает перед ответом — для сложных задач',
    },
    quota: 'standard',
    thinking: 'high',
    enabled: true,
  },
  {
    id: 'pro',
    label: '3.1 Pro',
    displayModel: 'Gemini 3.1 Pro',
    description: {
      ka: 'ყველაზე ძლიერი: კოდი, მათემატიკა, ანალიზი · დღიური ლიმიტით',
      en: 'Most capable: code, math, analysis · daily limit',
      ru: 'Самая мощная: код, математика, анализ · дневной лимит',
    },
    quota: 'pro',
    thinking: 'high',
    enabled: true,
  },
  {
    id: 'lite',
    label: '3.1 Flash-Lite',
    displayModel: 'Gemini 3.1 Flash-Lite',
    description: {
      ka: 'ყველაზე სწრაფი — მოკლე პასუხებისთვის',
      en: 'Fastest — for short replies',
      ru: 'Самая быстрая — для коротких ответов',
    },
    quota: 'standard',
    thinking: 'low',
    enabled: true,
  },
];

export function isChatModeId(v: unknown): v is ChatModeId {
  return typeof v === 'string' && (CHAT_MODE_IDS as readonly string[]).includes(v);
}

export function chatModeOption(id: ChatModeId): ChatModeOption {
  return CHAT_MODES.find((m) => m.id === id) ?? CHAT_MODES[0]!;
}

/** The modes a menu shows (enabled only), in menu order. */
export function enabledChatModes(): ChatModeOption[] {
  return CHAT_MODES.filter((m) => m.enabled);
}

/**
 * The mode a request asked for. Unknown / disabled → DEFAULT_CHAT_MODE. The legacy body field `tier: 'pro'` (older
 * clients) maps to 'pro'. NEVER returns anything but a catalogue id — no model id ever comes from the client.
 */
export function resolveChatMode(mode: unknown, legacyTier?: unknown): ChatModeId {
  const wanted: unknown = isChatModeId(mode) ? mode : legacyTier === 'pro' ? 'pro' : DEFAULT_CHAT_MODE;
  if (!isChatModeId(wanted)) return DEFAULT_CHAT_MODE;
  return chatModeOption(wanted).enabled ? wanted : DEFAULT_CHAT_MODE;
}

/** ListModels displayName for the ids this product uses (verified 2026-09-30). */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.7-flash': 'Gemini 3.7 Flash',
  'gemini-3.6-flash': 'Gemini 3.6 Flash',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gemini-pro-latest': 'Gemini Pro',
  'gemini-flash-latest': 'Gemini Flash',
  'gemini-flash-lite-latest': 'Gemini Flash-Lite',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
};

/**
 * A human name for a model id — the badge that says which model ACTUALLY answered (a rotation can serve a turn from
 * the next model in the chain). Unknown ids are prettified ("gemini-4.0-flash" → "Gemini 4.0 Flash"); anything that
 * is not a plausible model id comes back as-is, trimmed and bounded.
 */
export function displayNameFor(modelId: string | null | undefined): string {
  const id = String(modelId ?? '').trim().replace(/^models\//, '');
  if (!id) return '';
  const known = DISPLAY_NAMES[id.toLowerCase()];
  if (known) return known;
  if (!/^gemini-[a-z0-9.-]{1,60}$/i.test(id)) return id.slice(0, 60);
  return id
    .replace(/-preview$/i, '')
    .split('-')
    .map((part) => (part.toLowerCase() === 'lite' ? 'Lite' : /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
    .replace(/Flash Lite/, 'Flash-Lite');
}
