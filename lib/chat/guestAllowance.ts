import 'server-only';

/**
 * lib/chat/guestAllowance.ts — spend one GUEST chat turn, on the SAME allowance /api/chat/gemini uses.
 *
 * ⚠️ THE GUEST CAPS ONLY GUARDED ONE DOOR. lib/chat/guestChat caps a signed-out visitor at 10 turns per IP per day and
 * 250 for all guests together — but only /api/chat/gemini applied it. /api/chat/orchestrate (the /services/* chat
 * shell) and /api/agent-g/chat (the /services/* workspace chat) answered anonymous text turns on the platform's keys
 * with nothing but a per-minute IP limit, so the daily ceiling the whole guest policy rests on could be walked around
 * by posting to a sibling route. Every anonymous text-chat route now draws on these two buckets — same key prefixes,
 * same order — so a guest has ONE allowance, whichever chat they type into.
 *
 *   'ok'     — a turn was counted; answer it.
 *   'capped' — the per-IP or the global allowance is spent; answer with GUEST_NOTICE.cap (a sign-in offer).
 *   'closed' — CHAT_GUEST_ENABLED=0; a guest is refused outright (sign in).
 */
import type { NextRequest } from 'next/server';
import { checkRateLimit, checkRateLimitByKey } from '@/lib/api/rate-limit';
import {
  GUEST_GLOBAL_KEY,
  GUEST_NOTICE,
  guestChatDailyLimit,
  guestChatEnabled,
  guestChatGlobalDailyLimit,
} from '@/lib/chat/guestChat';

export type GuestTurn = 'ok' | 'capped' | 'closed';

export async function spendGuestTurn(req: NextRequest): Promise<GuestTurn> {
  if (!guestChatEnabled()) return 'closed';
  // Per-IP first, then the shared ceiling — an IP that is already capped must not keep spending the global bucket.
  const capped =
    (await checkRateLimit(req, guestChatDailyLimit())) ?? (await checkRateLimitByKey(GUEST_GLOBAL_KEY, guestChatGlobalDailyLimit()));
  return capped ? 'capped' : 'ok';
}

/** Guest chat switched off (CHAT_GUEST_ENABLED=0) — the same words /api/chat/gemini answers a guest with then. */
const SIGN_IN_TO_CHAT: Readonly<Record<'ka' | 'en' | 'ru', string>> = {
  ka: 'ჩატის გამოსაყენებლად შედი ანგარიშზე.',
  en: 'Sign in to use the chat.',
  ru: 'Войдите в аккаунт, чтобы пользоваться чатом.',
};

/** The localized sign-in offer for a guest who cannot be answered: the spent-allowance notice, or plain sign-in. */
export function guestRefusalMessage(turn: Exclude<GuestTurn, 'ok'>, locale: string | null | undefined): string {
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return turn === 'closed' ? SIGN_IN_TO_CHAT[lang] : GUEST_NOTICE.cap[lang];
}
