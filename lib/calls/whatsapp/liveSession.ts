/**
 * lib/calls/whatsapp/liveSession.ts — a Gemini Live session for one WhatsApp call, minted by OUR server.
 *
 * The bridge gets a one-use ephemeral token whose setup (model, prompt, phone tools, transcription, compression) is
 * LOCKED at mint time, never our API key. Google recommends a plain key for backend-to-Gemini traffic; we keep the key
 * off the bridge VM on purpose: a compromised bridge then holds nothing reusable, cannot change Agent G's prompt or
 * tools, and each token dies with its session. Each mint (first session or a resumption after Google's ~10-minute
 * connection limit) is counted against the call (callService takeLiveMint).
 *
 * Unlike the browser's mint (app/api/voice/live), there is no unlocked fallback: a session whose lock Google refuses is
 * a failed call (`live_failed`), never a bridge-chosen setup.
 *
 * ⚠️ MASTER TASK v3.1: the mint goes through lib/voice/liveMint, and no minter exists today (the Developer API
 * ephemeral token is refused; Vertex AI Live needs a server relay). So a session answers `live_transport_unavailable`
 * before memory, budget or any provider I/O, whatever AI Studio key is set. The whole calling feature is also off by
 * default (WHATSAPP_CALLING_ENABLED).
 */
import { resolveLiveModel } from '@/lib/ai/google/models';
import { buildPlatformPrompt } from '@/lib/chat/platformPrompt';
import { chatBudgetAllows } from '@/lib/services/billing/chatBudget';
import { SUPPORT_EMAIL } from '@/lib/support';
import type { LiveSetupMessage } from '@/lib/voice/geminiLive';
import { buildPhoneLiveSetup } from './phoneSetup';
import { agentScope } from './phoneTools';
import type { CallTicket } from './ticket';
import { liveTokenMinter, type LiveTokenMinter } from '@/lib/voice/liveMint';

const MAX_SESSION_MS = 30 * 60_000;
const NEW_SESSION_WINDOW_MS = 60_000;

export type CallSession =
  | { ok: true; token: string; setupMessage: LiveSetupMessage; expiresAt: string }
  | { ok: false; error: 'live_transport_unavailable' | 'budget_exhausted' | 'live_token_unavailable' };

export interface CallSessionDeps {
  minter(): LiveTokenMinter | null;
  memory(userId: string): Promise<string>;
  budgetAllows(text: string, model: string): Promise<boolean>;
  now(): number;
  env: NodeJS.ProcessEnv;
}

export const liveCallSessionDeps = (): CallSessionDeps => ({
  minter: liveTokenMinter,
  memory: async (userId) => (await import('@/lib/memory/context').then((m) => m.memoryContextOf(userId)).catch(() => null)) ?? '',
  budgetAllows: chatBudgetAllows,
  now: () => Date.now(),
  env: process.env,
});

export async function mintCallSession(
  deps: CallSessionDeps,
  ticket: Pick<CallTicket, 'userId' | 'locale' | 'exp'>,
  resumptionHandle: string | null,
): Promise<CallSession> {
  const minter = deps.minter();
  if (!minter) return { ok: false, error: 'live_transport_unavailable' };
  const model = resolveLiveModel(deps.env.WHATSAPP_CALL_LIVE_MODEL ?? null);
  const now = deps.now();
  const frame = buildPhoneLiveSetup({
    model,
    locale: ticket.locale,
    platformSystem: buildPlatformPrompt({ locale: ticket.locale, now: new Date(now), googleSearch: false }),
    memoryBlock: await deps.memory(ticket.userId),
    scope: agentScope(deps.env),
    supportEmail: SUPPORT_EMAIL,
    resumptionHandle,
  });
  if (!(await deps.budgetAllows(frame.setup.systemInstruction?.parts[0]?.text ?? '', model))) return { ok: false, error: 'budget_exhausted' };

  const expires = Math.min(now + MAX_SESSION_MS, Math.max(now + NEW_SESSION_WINDOW_MS, ticket.exp));
  const expireTime = new Date(expires).toISOString();
  try {
    const res = await minter.mint(
      {
        uses: 1,
        expireTime,
        newSessionExpireTime: new Date(now + NEW_SESSION_WINDOW_MS).toISOString(),
        bidiGenerateContentSetup: frame.setup,
      },
      10_000,
    );
    if (!res.ok) {
      console.warn('[WhatsApp.Calls] live_mint_refused', { status: res.status });
      return { ok: false, error: 'live_token_unavailable' };
    }
    const data = (await res.json().catch(() => ({}))) as { name?: unknown };
    const token = typeof data.name === 'string' ? data.name.trim() : '';
    return token ? { ok: true, token, setupMessage: frame, expiresAt: expireTime } : { ok: false, error: 'live_token_unavailable' };
  } catch {
    return { ok: false, error: 'live_token_unavailable' };
  }
}
