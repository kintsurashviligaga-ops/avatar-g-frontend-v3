/**
 * lib/voice/liveMint.ts — who mints the credential a browser opens a Gemini Live session with.
 *
 * The Gemini Developer API's ephemeral token (auth_tokens on generativelanguage.googleapis.com, billed to the AI Studio
 * key) is refused under MASTER TASK v3.1, key or no key. Vertex AI authenticates Live with the service account's OAuth
 * token, which may never reach a browser, so Vertex Live runs through our Live relay (services/live-relay, Cloud Run):
 * the minter here signs a relay TICKET (lib/voice/relay/ticket) that locks the server-built setup, and the browser opens
 * the relay with it (`wsUrl`). The relay holds the service account; this app never sees a Google token for Live.
 *
 * The relay minter exists only when LIVE_RELAY_URL (wss://…) and LIVE_RELAY_TICKET_SECRET (≥ 32 chars, the same value
 * as the relay's) are both set. Otherwise liveTokenMinter() is null, /api/voice/live (and the WhatsApp bridge) answer
 * "unavailable" before any provider I/O, and the browser falls back to the REST voice loop, which runs on Vertex AI.
 *
 * A minter answers like an HTTP mint: 200 with `{ name }` (the credential). The relay minter signs locally, so it never
 * answers 400 (Vertex refuses a bad setup when the session opens, as a close code); the route's fallback chain stays
 * for any future minter that does.
 */
import 'server-only';
import { lockDigests, mintTicket, subjectOf, TICKET_SECRET_MIN_LENGTH } from './relay/ticket';

export interface LiveMintRequest {
  uses: 1;
  expireTime: string;
  newSessionExpireTime: string;
  bidiGenerateContentSetup: object;
  /** Who the session is for (the user id). The relay ticket carries only a short hash of it, for logs. */
  subject?: string;
}

export interface LiveTokenMinter {
  mint(request: LiveMintRequest, timeoutMs: number): Promise<Response>;
  /** Set when the credential opens our Live relay instead of Google directly: the browser connects here. */
  wsUrl?: string;
}

/** Why a Live call cannot start, in names only. Reported in logs, never to the browser. */
export const LIVE_TRANSPORT_UNAVAILABLE =
  'no Live transport: the Developer API ephemeral token is refused (MASTER TASK v3.1) and no Live relay is configured (LIVE_RELAY_URL, LIVE_RELAY_TICKET_SECRET)';

/** LIVE_RELAY_URL when it is a plain wss:// URL (no credentials, no query, no fragment), else null. */
export function liveRelayUrl(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'wss:' || u.username || u.password || u.search || u.hash) return null;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function relayTicketMinter(url: string, secret: string, now: () => number = Date.now): LiveTokenMinter {
  return {
    wsUrl: url,
    async mint(request) {
      const nowMs = now();
      const expMs = Date.parse(request.expireTime);
      const nseMs = Date.parse(request.newSessionExpireTime);
      if (!Number.isFinite(expMs) || !Number.isFinite(nseMs) || expMs <= nowMs) {
        return new Response(JSON.stringify({ error: 'bad_expiry' }), { status: 500 });
      }
      const name = mintTicket(secret, {
        sub: subjectOf(request.subject ?? 'anonymous'),
        nowMs,
        nseMs: Math.min(nseMs, expMs),
        expMs,
        digests: lockDigests(request.bidiGenerateContentSetup),
      });
      return new Response(JSON.stringify({ name }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}

export function liveTokenMinter(env: Record<string, string | undefined> = process.env): LiveTokenMinter | null {
  const url = liveRelayUrl(env.LIVE_RELAY_URL);
  const secret = (env.LIVE_RELAY_TICKET_SECRET ?? '').trim();
  if (!url || secret.length < TICKET_SECRET_MIN_LENGTH) return null;
  return relayTicketMinter(url, secret);
}
