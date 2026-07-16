/**
 * THE FINANCIAL SHIELD — server-side auth + balance gate for the RAW vendor generation routes
 * (/api/ltx-video, /api/heygen/avatar, /api/udio/generate, /api/replicate/image).
 *
 * These routes call PAID external providers. The root middleware deliberately skips /api/*, and
 * /api/creations only RECORDS `credits_used` (it never deducts), so before this guard the routes
 * were reachable ANONYMOUSLY with no balance check — free paid compute. The client-side balance
 * check in the studio UIs is cosmetic and trivially bypassable.
 *
 * guardGeneration() enforces two invariants at the server boundary:
 *   1. No valid Supabase session  → 401 (no provider call, no wasted compute).
 *   2. Authenticated but the balance-of-record (profiles.credits_balance) is positively below the
 *      representative cost → 402 with a localized "Insufficient Credits" message.
 *
 * The balance read is FAIL-OPEN (hasSufficientBalance returns true on any read miss), so a transient
 * DB blip never blocks a paying user; the per-asset ref-idempotent deduct_credits stays the real
 * backstop and rejects overdraw. This gate only ever blocks a user we can POSITIVELY confirm is broke.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { hasSufficientBalance } from '@/lib/orchestrator/ledger';

export type GenKind = 'image' | 'music' | 'video' | 'avatar';

/**
 * Representative pre-dispatch cost used ONLY for the blocking gate — never to charge. A single
 * conservative floor per kind (the real, precise charge happens post-success via deduct_credits).
 * Mirrors lib/credits/pricing CREDIT_COSTS (image 2 · music_30s 5 · avatar_30s 20 · video_30s 25).
 */
const GATE_COST: Record<GenKind, number> = {
  image: 2,
  music: 5,
  avatar: 20,
  video: 25,
};

type GateLocale = 'ka' | 'en' | 'ru';

function localeFromRequest(req: NextRequest): GateLocale {
  const c = req.cookies.get('NEXT_LOCALE')?.value;
  return c === 'en' || c === 'ru' ? c : 'ka';
}

/** The contract's exact wording: "არასაკმარისი კრედიტები / Insufficient Credits". */
export function insufficientCreditsMessage(locale: GateLocale): string {
  if (locale === 'en') return 'Insufficient Credits';
  if (locale === 'ru') return 'Недостаточно кредитов';
  return 'არასაკმარისი კრედიტები';
}

export type GuardOk = { ok: true; userId: string; locale: GateLocale };
export type GuardFail = { ok: false; response: NextResponse };

/**
 * Auth + balance gate for a raw vendor generation route. Call it at the very top of the generation
 * POST (AFTER the rate-limit check, BEFORE any provider call). On a poll/status request (which does
 * not start new compute) pass `{ gate: false }` to auth-only — polls must never be blocked or re-gated.
 */
export async function guardGeneration(
  req: NextRequest,
  kind: GenKind,
  opts: { gate?: boolean } = {},
): Promise<GuardOk | GuardFail> {
  const locale = localeFromRequest(req);

  let userId: string;
  try {
    const user = await requireAuthenticatedUser(req);
    userId = user.id;
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'unauthorized', error_code: 'UNAUTHENTICATED' },
        { status: 401 },
      ),
    };
  }

  if (opts.gate !== false) {
    const cost = GATE_COST[kind];
    // Block ONLY on a positive "insufficient" signal; a null/error read is fail-open (true).
    const sufficient = await hasSufficientBalance(userId, cost).catch(() => true);
    if (!sufficient) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'insufficient_credits',
            error_code: 'INSUFFICIENT_CREDITS',
            requiredCredits: cost,
            message: insufficientCreditsMessage(locale),
          },
          { status: 402 },
        ),
      };
    }
  }

  return { ok: true, userId, locale };
}
