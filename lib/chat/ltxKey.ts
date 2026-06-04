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
 * Precedence is most-specific → most-generic. The first non-empty value wins.
 *
 * NOTE: a live-fire test proved production's `LTX_VIDEO_API_KEY` is the
 * dispatch-valid, funded key (it accepts jobs + charges), whereas the co-present
 * `LTX2_API_KEY` value in prod is NOT dispatch-valid (briefly preferring it made
 * every clip fail at dispatch → "video provider connection failed"). So
 * `LTX_VIDEO_API_KEY` stays first; LTX2 is only a last-resort fallback. (The
 * LOCAL dev env happens to carry the funded key under LTX2_API_KEY, which is why
 * the local repro succeeded — a per-environment value difference, not a code
 * issue.) Never logs or returns the key to callers other than as the bearer secret.
 */
const LTX_KEY_ALIASES = ['LTX_VIDEO_API_KEY', 'LTX_API_KEY', 'LTX2_API_KEY'] as const;

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
