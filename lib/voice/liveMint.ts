/**
 * lib/voice/liveMint.ts — who mints the credential a browser opens a Gemini Live session with.
 *
 * Under MASTER TASK v3.1 nobody does, so liveTokenMinter() is null:
 *   · the only minter Live ever had was the Gemini Developer API's ephemeral-token endpoint (auth_tokens on
 *     generativelanguage.googleapis.com, billed to the AI Studio key), and v3.1 refuses the Developer API outright,
 *     key or no key;
 *   · ephemeral tokens are a Developer API feature only. Vertex AI authenticates Live with the service account's OAuth
 *     token, which may never reach a browser, so a Vertex Live call needs a server relay, and none exists yet.
 * /api/voice/live (and the WhatsApp bridge) answer "unavailable" before any provider I/O when this is null; the browser
 * then falls back to the REST voice loop, which runs on Vertex AI.
 *
 * A future minter (a Vertex relay's session ticket) receives the complete server-owned lock and answers like an HTTP
 * mint: 200 with `{ name }` on success, 400 when the lock is refused. The route's fallback chain is written against that.
 */
import 'server-only';

export interface LiveMintRequest {
  uses: 1;
  expireTime: string;
  newSessionExpireTime: string;
  bidiGenerateContentSetup: object;
}

export interface LiveTokenMinter {
  mint(request: LiveMintRequest, timeoutMs: number): Promise<Response>;
}

/** Why a Live call cannot start, in names only. Reported in logs, never to the browser. */
export const LIVE_TRANSPORT_UNAVAILABLE =
  'no Live transport: the Developer API ephemeral token is refused (MASTER TASK v3.1) and Vertex AI Live needs a server relay';

export function liveTokenMinter(): LiveTokenMinter | null {
  return null;
}
