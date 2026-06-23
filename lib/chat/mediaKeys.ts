/**
 * PHASE 46 §1 — Canonical media-provider API-key resolvers (the "alias mismatch"
 * fix, extended to the audio + storyboard agents).
 *
 * PHASE 45 hardened LTX against the historical alias problem (see ltxKey.ts):
 * the render path only read one env name, so a correctly-provisioned key living
 * under a different alias silently fell back to a simulated `skipped` leg — no
 * external HTTP call was ever made. The Udio (score), ElevenLabs (voice/foley)
 * and Nano Banana (storyboard) agents had the same latent defect: each read a
 * single hard-coded `process.env.X`. When the host/Vercel shell provisions the
 * same credential under a sibling alias, the leg never fires.
 *
 * These resolvers walk a precedence list (most-specific → most-generic) and
 * return the first non-empty value. They never log or expose the secret beyond
 * returning it as the bearer credential, and the alias arrays are exported so
 * the runtime config-audit can report *which* alias resolved without ever
 * touching the value.
 */

function resolveFromAliases(aliases: readonly string[], env: NodeJS.ProcessEnv): string | null {
  for (const name of aliases) {
    const v = env[name];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** Which alias (if any) currently carries a non-empty value. Names only — never the value. */
export function resolveAliasName(aliases: readonly string[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const name of aliases) {
    const v = env[name];
    if (typeof v === 'string' && v.trim().length > 0) return name;
  }
  return null;
}

// ─── Udio (LEGACY) ───────────────────────────────────────────────────────────
// v330: the music-video + film pipeline AND standalone Music mode are fully migrated
// to ElevenLabs Music (master) + Replicate MusicGen (fallback) — Udio is no longer
// used there. The resolver remains ONLY for legacy endpoints not yet migrated
// (/api/udio/generate and its callers); it is otherwise dead. Do not add new Udio call sites.
const UDIO_KEY_ALIASES = ['UDIO_API_KEY', 'UDIO_KEY', 'UDIOAPI_KEY', 'UDIO_API_TOKEN'] as const;

export function resolveUdioApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return resolveFromAliases(UDIO_KEY_ALIASES, env);
}
export function hasUdioApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveUdioApiKey(env) !== null;
}
export const UDIO_API_KEY_ALIASES = UDIO_KEY_ALIASES;

// ─── ElevenLabs (voiceover / foley) ──────────────────────────────────────────
// The official request header is `xi-api-key`, so `XI_API_KEY` is a common alias.
const ELEVENLABS_KEY_ALIASES = ['ELEVENLABS_API_KEY', 'ELEVEN_API_KEY', 'ELEVENLABS_KEY', 'XI_API_KEY'] as const;

export function resolveElevenLabsApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return resolveFromAliases(ELEVENLABS_KEY_ALIASES, env);
}
export function hasElevenLabsApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveElevenLabsApiKey(env) !== null;
}
export const ELEVENLABS_API_KEY_ALIASES = ELEVENLABS_KEY_ALIASES;

// ─── Nano Banana (storyboard architect — Gemini 2.5 Flash Image) ─────────────
// Nano Banana is the Gemini image model, so a bare GEMINI_API_KEY is a valid
// last-resort alias when no dedicated key is provisioned.
const NANOBANANA_KEY_ALIASES = ['NANOBANANA_API_KEY', 'NANO_BANANA_API_KEY', 'NANOBANANA_KEY', 'GEMINI_API_KEY'] as const;

export function resolveNanoBananaApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return resolveFromAliases(NANOBANANA_KEY_ALIASES, env);
}
export function hasNanoBananaApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveNanoBananaApiKey(env) !== null;
}
export const NANOBANANA_API_KEY_ALIASES = NANOBANANA_KEY_ALIASES;
