/**
 * PHASE 45 §1 — Canonical LTX API-key resolver (the "alias mismatch" fix).
 *
 * The render path historically gated on `LTX_VIDEO_API_KEY` only, while the
 * host/Vercel environment provisions the same credential under one of several
 * historical aliases (`LTX_API_KEY`, `LTX2_API_KEY`). When the key lived under
 * an alias, `renderClip` silently returned `skipped` and no external HTTP call
 * was ever made — the exact "environmental variable mapping mismatch" that
 * bypassed the live pipeline. This helper resolves the key from any of the
 * three names so a correctly-provisioned credential always reaches LTX.
 *
 * Precedence: the first non-empty value wins. `LTX2_API_KEY` is checked FIRST.
 *
 * WHY LTX2_API_KEY leads: a live-fire diagnosis proved the production env had
 * BOTH `LTX_VIDEO_API_KEY` and `LTX2_API_KEY` set, but `LTX_VIDEO_API_KEY`
 * pointed at a key whose async jobs charged-but-never-completed (clips stuck at
 * 0/5), while `LTX2_API_KEY` was the funded key that generates real video
 * end-to-end (verified by running the real dispatch+poll → completed mp4).
 * Preferring the proven-funded alias makes the render path resolve a WORKING key
 * with no env edit. The other aliases remain supported fallbacks. Never logs or
 * returns the key to callers other than as the bearer secret.
 */
const LTX_KEY_ALIASES = ['LTX2_API_KEY', 'LTX_VIDEO_API_KEY', 'LTX_API_KEY'] as const;

export function resolveLtxApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const name of LTX_KEY_ALIASES) {
    const v = env[name];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** True when any LTX alias carries a non-empty key — the render path can fire. */
export function hasLtxApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveLtxApiKey(env) !== null;
}

/** The alias names checked, exposed for diagnostics / config-audit parity. */
export const LTX_API_KEY_ALIASES = LTX_KEY_ALIASES;
