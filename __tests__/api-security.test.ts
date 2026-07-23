/**
 * API SECURITY GUARD — a static CI safeguard against anonymous financial-drain routes.
 *
 * The pre-Iteration-3 audit found deployed, publicly-reachable API routes that called PAID media
 * providers (Replicate / ElevenLabs / HeyGen / Kling / Udio) on the platform's API keys with NO
 * authentication — anonymous unbounded spend. The `guardGeneration` FINANCIAL SHIELD (auth + balance
 * gate) + per-route auth exist to prevent this, but nothing stopped a NEW unguarded proxy from being
 * added. This test does: it fails `npm test` (and thus blocks deploy) if any route under app/api/**
 * contacts a paid generation provider without an auth/guard signal AND without an explicit, reasoned
 * allowlist entry. Adding a new provider route now forces a visible decision: guard it, or justify it.
 *
 * It is a STATIC scan (reads route source from disk) — no network, no runtime, deterministic.
 *
 * Iteration 6 (WS2) — CLOSED THE HELPER-ABSTRACTION BLIND SPOT: the original scan only matched a direct
 * `api.elevenlabs.io` / `createPrediction(` string in the route file, so a route that drained a paid
 * vendor via a helper import (e.g. `synthesizeWithTimestamps` from `@/lib/elevenlabs/ttsTimestamps`)
 * showed no provider string and slipped through unguarded (ads/tts, audio/isolate, agent-g/calls/*).
 * PAID_PROVIDER_SIGNALS now also flags imports of the known paid-provider helper libs, so call-site
 * abstraction no longer hides a drain from the gate.
 */
import fs from 'fs';
import path from 'path';

const API_DIR = path.join(process.cwd(), 'app', 'api');

/** Every `route.ts` under app/api/**. */
function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectRouteFiles(full));
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') out.push(full);
  }
  return out;
}

/** Signals that a route actually CALLS a paid media-generation provider (the drain vectors). */
const PAID_PROVIDER_SIGNALS: RegExp[] = [
  // ── Direct provider endpoints / SDK calls ────────────────────────────────────────────────────
  /createPrediction\s*\(/,               // Replicate (image / video / avatar)
  /api\.replicate\.com/,
  /api\.elevenlabs\.io/,                 // ElevenLabs TTS / SFX / voice
  /api\.heygen\.com|upload\.heygen\.com/, // HeyGen avatar / presenter
  /klingai\.com|['"`]kling/i,            // Kling video
  /api\.udio|UDIO_API_KEY/,              // Udio music
  // ── Helper-abstracted calls (WS2): importing one of these lib modules means the route drains a paid
  //    vendor even without a direct api.* string. Any such route must still be guarded or allowlisted.
  /from\s+['"]@\/lib\/elevenlabs\//,                              // ElevenLabs helpers (TTS / SFX / isolation / music)
  /from\s+['"]@\/lib\/voice-v2v\/providers['"]/,                  // synthesizeSpeechChunk / transcribeRealtimePcmChunk (paid TTS+STT)
  /from\s+['"]@\/lib\/voice-v2v\/(geminiStt|replicateStt)['"]/,   // paid STT helpers
  /from\s+['"]@\/lib\/heygen/,                                    // HeyGen helpers
  /\b(synthesizeWithTimestamps|isolateVocal|synthesizeSpeechChunk|transcribeRealtimePcmChunk)\s*\(/, // named paid helpers (defence in depth)
];

/** Signals that a route enforces auth OR a canonical gate (NOT rate-limiting — that is not auth). */
const AUTH_SIGNALS: RegExp[] = [
  /guardGeneration\s*\(/,                       // the canonical FINANCIAL SHIELD
  /requireUser\s*\(/,
  /requireAuthenticatedUser\s*\(/,
  /authedClientFromRequest\s*\(/,
  /auth\.getUser\s*\(/,                          // direct Supabase session check (+ RLS-scoped writes)
  /assertAdmin(Access)?\s*\(/,                  // admin-gated
  /x-admin-key|ADMIN_KEY|MIGRATION_RUN_KEY/,    // admin-key gated
  /constructEvent\s*\(/,                        // Stripe webhook signature verification
  /CRON_SECRET/,                                // cron-secret gated
  /WORKER_INTERNAL_TOKEN|x-internal-worker-token|x-internal-key/, // internal server-to-server token (telephony / worker sub-routes)
];

/**
 * Documented EXCEPTIONS: routes that contact a provider without a user-auth signal, each with a REASON.
 * These are the GRANDFATHERED gaps the security audit surfaced (rate-limited paid generation whose
 * user-auth is a tracked follow-up) plus internal/build routes. A NEW provider route that is neither
 * guarded nor listed here fails the test — so this list is the single, reviewed place where an
 * unauthenticated provider route can exist. Shrinking it (by adding real auth) is the goal.
 */
const ALLOWLIST: Record<string, string> = {
  // ── Grandfathered gaps: user-facing PAID generation, rate-limited but not user-auth'd. Surfaced by
  //    the pre-Iteration-3 audit; user-auth is a tracked follow-up. Listed so the guard still protects
  //    NEW routes while these known gaps are worked down (goal: empty this section).
  'app/api/elevenlabs/tts/route.ts': 'ElevenLabs TTS — rate-limited (checkRateLimit); user-auth TODO (audit follow-up)',
  'app/api/elevenlabs/sound/route.ts': 'ElevenLabs SFX — rate-limited (RATE_LIMITS.WRITE); user-auth TODO (audit follow-up)',
  'app/api/matilda/route.ts': 'Matilda voice (ElevenLabs TTS) — user-auth TODO (audit follow-up)',
  'app/api/film/storyboard/route.ts': 'FLUX storyboard frames — STORYBOARD rate-limited; user-auth TODO (audit follow-up)',
  'app/api/pipeline/route.ts': 'Pipeline Replicate image — rate-limited; user-auth TODO (audit follow-up)',
  // ── WS2: interactive chat-mic voice routes. Client-facing + rate-limited + low per-call cost (short
  //    Whisper/STT utterances); guest voice input is a live product feature, so requiring user-auth is a
  //    PRODUCT decision (would remove guest voice), not a pure security fix. Listed as a reasoned exception
  //    rather than broken. voice/realtime/session additionally soft-auths (getAuthenticatedUser) + is inert
  //    in prod without VOICE_V2V_WS_URL + is WS-token gated.
  'app/api/voice/transcribe/route.ts': 'Chat-mic STT (Whisper) — rate-limited (RATE_LIMITS.READ); guest voice = product feature; user-auth is a product decision',
  'app/api/voice/realtime/session/route.ts': 'Realtime voice session-token minter — soft-auths, inert without VOICE_V2V_WS_URL, WS-token gated; user-auth is a product decision',
  // ── Health / status / diagnostic monitoring: reference or PING provider endpoints (env presence,
  //    /v1/user, /v2/voices) — no media generation, no drain. Should ideally be admin-gated; low risk.
  'app/api/health/public/route.ts': 'Public health — pings provider status endpoints (/v1/user, /v2/voices), no generation',
  'app/api/system/film-readiness/route.ts': 'Diagnostic — provider env-presence only, no generation',
  'app/api/system/film-selftest/route.ts': 'Diagnostic self-test — actively probes providers; monitoring only (ideally admin-gated)',
};

const toRel = (abs: string) => path.relative(process.cwd(), abs).split(path.sep).join('/');
const has = (src: string, sigs: RegExp[]) => sigs.some((r) => r.test(src));

describe('API security guard — no unauthenticated paid-provider routes', () => {
  const routeFiles = collectRouteFiles(API_DIR);

  it('finds a non-trivial number of routes (sanity: the scanner is actually scanning)', () => {
    expect(routeFiles.length).toBeGreaterThan(50);
  });

  it('every paid-provider route is guarded, authenticated, or explicitly allowlisted', () => {
    const violations: string[] = [];
    for (const abs of routeFiles) {
      const src = fs.readFileSync(abs, 'utf8');
      if (!has(src, PAID_PROVIDER_SIGNALS)) continue;   // does not call a paid generation provider
      if (has(src, AUTH_SIGNALS)) continue;             // has an auth / guard signal
      const rel = toRel(abs);
      if (rel in ALLOWLIST) continue;                   // documented exception
      violations.push(rel);
    }
    // A failure here means a NEW paid-provider route was added WITHOUT guardGeneration/auth and is not
    // in the reasoned ALLOWLIST above. Guard it (import guardGeneration + gate the create path) or, if
    // it is genuinely safe without user-auth, add it to ALLOWLIST with a justification.
    expect(violations).toEqual([]);
  });

  it('the allowlist has no stale entries (each must still be an unguarded provider route)', () => {
    const stale: string[] = [];
    for (const rel of Object.keys(ALLOWLIST)) {
      const abs = path.join(process.cwd(), rel);
      if (!fs.existsSync(abs)) { stale.push(`${rel} — file no longer exists`); continue; }
      const src = fs.readFileSync(abs, 'utf8');
      if (!has(src, PAID_PROVIDER_SIGNALS)) { stale.push(`${rel} — no longer calls a paid provider`); continue; }
      if (has(src, AUTH_SIGNALS)) { stale.push(`${rel} — now has an auth/guard signal (remove from allowlist)`); }
    }
    // Keeps the exception list honest: when a grandfathered route gets guarded (or deleted), its
    // allowlist entry must be removed so the list only ever contains real, current exceptions.
    expect(stale).toEqual([]);
  });
});
