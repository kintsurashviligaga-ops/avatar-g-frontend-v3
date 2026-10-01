/**
 * lib/chat/guestChat.ts — what a signed-out visitor may do in the product chat (/api/chat/gemini).
 *
 * The home page (`/{lang}`) opens straight on the chat. A visitor can talk to it before creating an account; every
 * paid tool (video, image, music, avatar, files, voice) still asks them to sign in first. This module is the whole
 * guest policy, pure and env-driven, so the route and its tests read one definition.
 *
 *   · Fast only — the Pro allowance is per ACCOUNT (lib/api/rate-limit `CHAT_PRO_USER`); a guest has none.
 *   · Text only — files and photos are for signed-in users (a guest turn carrying media is answered with a sign-in
 *     notice, never sent to the model).
 *   · No Google Search grounding unless CHAT_GUEST_SEARCH=1 — grounding is billed per query, and it is the one cost a
 *     guest turn can multiply.
 *   · A shorter answer (GUEST_MAX_OUTPUT_TOKENS) and a bounded message (GUEST_MAX_MESSAGE_CHARS).
 *   · Two daily caps: per IP (CHAT_GUEST_DAILY_LIMIT, default 10) and for ALL guests together
 *     (CHAT_GUEST_GLOBAL_DAILY_LIMIT, default 250).
 *
 * ⚠️ THE GLOBAL CAP IS WHAT PROTECTS PAYING USERS. The platform's daily budget guard (chatBudgetAllows, $10/day by
 * default) is shared by everyone; rotating IPs defeats any per-IP cap, so without a ceiling on guests as a group a
 * scripted flood could spend the day's budget and every signed-in user would be refused. 250 Fast turns with no
 * grounding and ≤ 2,048 output tokens is a few dollars at worst — a bounded marketing cost, not an open tap.
 *
 * ⚠️ A SPENT CAP IS A SIGN-IN PROMPT, NOT AN ERROR. The route answers it in-stream with code `auth_required`, which
 * the browser turns into the sign-in sheet (hooks/chat/useChatStream → onAuthRequired). Signing in is free and lifts
 * the guest limits entirely.
 *
 * CHAT_GUEST_ENABLED=0 closes guest chat (the route then answers 401 as before). FILM_ALLOW_ANONYMOUS=1 (a demo
 * deployment) keeps its old, looser meaning and bypasses this policy.
 */
import { isEnabledByDefault, isTruthyFlag } from '@/lib/env/flag';
import type { RateLimitConfig } from '@/lib/api/rate-limit';
import type { WireMessage } from './historySerializer';

const DAY_MS = 24 * 60 * 60_000;

export const DEFAULT_GUEST_DAILY_LIMIT = 10;
export const DEFAULT_GUEST_GLOBAL_DAILY_LIMIT = 250;
/** An override may not raise the caps past these — a typo must not unbound anonymous spend. */
const MAX_GUEST_DAILY_LIMIT = 200;
const MAX_GUEST_GLOBAL_DAILY_LIMIT = 20_000;

/** A guest's answer ceiling. Fast's own default is 4,096; half keeps a worst-case guest turn ~1.5¢. */
export const GUEST_MAX_OUTPUT_TOKENS = 2048;
/** The longest message a guest may send. A pasted book is a signed-in use. */
export const GUEST_MAX_MESSAGE_CHARS = 4000;

/** The key under which ALL guests share one counter (checkRateLimitByKey). */
export const GUEST_GLOBAL_KEY = 'all';

export function guestChatEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isEnabledByDefault(env.CHAT_GUEST_ENABLED);
}

export function guestSearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyFlag(env.CHAT_GUEST_SEARCH);
}

/** A whole number within [0, max] from the env, else the default. 0 is honoured ("no guest turns"). */
function boundedInt(raw: string | undefined, fallback: number, max: number): number {
  const v = (raw ?? '').trim();
  if (!/^\d{1,6}$/.test(v)) return fallback;
  const n = Number(v);
  return n <= max ? n : fallback;
}

/** Per-IP daily guest allowance. Its own namespace: it never shares a bucket with signed-in chat. */
export function guestChatDailyLimit(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    maxRequests: boundedInt(env.CHAT_GUEST_DAILY_LIMIT, DEFAULT_GUEST_DAILY_LIMIT, MAX_GUEST_DAILY_LIMIT),
    windowMs: DAY_MS,
    keyPrefix: 'rl:chat:guest',
  };
}

/** The ceiling on every guest together, per day. */
export function guestChatGlobalDailyLimit(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    maxRequests: boundedInt(env.CHAT_GUEST_GLOBAL_DAILY_LIMIT, DEFAULT_GUEST_GLOBAL_DAILY_LIMIT, MAX_GUEST_GLOBAL_DAILY_LIMIT),
    windowMs: DAY_MS,
    keyPrefix: 'rl:chat:guest:global',
  };
}

export type GuestRefusal = 'media' | 'too_long';

function hasMedia(m: WireMessage): boolean {
  return Array.isArray(m.content) && m.content.some((p) => p.type !== 'text');
}

function textLength(m: WireMessage): number {
  if (typeof m.content === 'string') return m.content.length;
  return m.content.reduce((n, p) => n + (p.type === 'text' ? p.text.length : 0), 0);
}

/**
 * Why a guest turn must not reach the model, or null. Checks the SERIALIZED history (what would be sent), so a file
 * smuggled into an earlier turn is caught as surely as one in the latest.
 */
export function guestTurnRefusal(wire: readonly WireMessage[]): GuestRefusal | null {
  if (wire.some(hasMedia)) return 'media';
  const last = wire[wire.length - 1];
  if (last && textLength(last) > GUEST_MAX_MESSAGE_CHARS) return 'too_long';
  return null;
}

type Locale = 'ka' | 'en' | 'ru';

/** The notices a guest sees. Each ends in the same offer: an account is free and lifts the limit. */
export const GUEST_NOTICE: Readonly<Record<'cap' | GuestRefusal, Record<Locale, string>>> = {
  cap: {
    ka: 'სტუმრის დღევანდელი შეტყობინებები ამოიწურა. შედი ან შექმენი უფასო ანგარიში და გააგრძელე საუბარი.',
    en: "You've used today's guest messages. Sign in or create a free account to keep chatting.",
    ru: 'Гостевые сообщения на сегодня закончились. Войдите или создайте бесплатный аккаунт, чтобы продолжить.',
  },
  media: {
    ka: 'ფაილებისა და ფოტოების გასაგზავნად შედი ანგარიშზე — ეს უფასოა.',
    en: 'Sign in to send files and photos — it’s free.',
    ru: 'Войдите, чтобы отправлять файлы и фото — это бесплатно.',
  },
  too_long: {
    ka: `სტუმრის შეტყობინება ${GUEST_MAX_MESSAGE_CHARS} სიმბოლომდეა. გრძელი ტექსტისთვის შედი ანგარიშზე — ეს უფასოა.`,
    en: `Guest messages are limited to ${GUEST_MAX_MESSAGE_CHARS} characters. Sign in for longer ones — it’s free.`,
    ru: `Гостевое сообщение — до ${GUEST_MAX_MESSAGE_CHARS} символов. Для длинных войдите — это бесплатно.`,
  },
};
