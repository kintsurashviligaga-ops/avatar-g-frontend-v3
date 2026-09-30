/**
 * lib/api/forwardSession.ts — carry the caller's session onto a server-to-server self-call.
 *
 * A route that calls another of our own routes over HTTP (the produce pipelines → /api/elevenlabs/tts) makes a NEW
 * request: it arrives with no cookie and no Authorization header, so a route that requires a signed-in user (every
 * paid route, lib/auth/generationGate) answers 401 — the voiceover silently vanished from every produced film when the
 * TTS route gained its sign-in gate. The caller's own session is forwarded instead: the downstream route then sees the
 * same user it would have seen from the browser, and nothing is widened (no internal bypass secret exists or is added).
 */
export function forwardSessionHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const cookie = req.headers.get('cookie');
  const authorization = req.headers.get('authorization');
  if (cookie) out.cookie = cookie;
  if (authorization) out.authorization = authorization;
  return out;
}
