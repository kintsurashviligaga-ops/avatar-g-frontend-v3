/**
 * Hard-locked primary generation engines (Stage-2 V8-F1).
 *
 * One source of truth for the model defaults so EVERY render path agrees. Before
 * this, three live paths still defaulted to the older `kwaivgi/kling-v1.6-standard`
 * (warmer/softer render) while the chat i2v path defaulted to v2.1 — the inconsistency
 * meant the same request could land on different engines depending on entry point.
 *
 * `REPLICATE_VIDEO_MODEL` still overrides per-deploy (ops escape hatch — keep it so a
 * bad model can be hot-swapped without a code push); when it is UNSET, all paths now
 * default to Kling v2.1. v1.6-standard stays the deliberate cheaper LAST-RESORT for the
 * fail-open cascade — hard-lock means one primary, not zero fallbacks.
 *
 * NOTE for ops: if REPLICATE_VIDEO_MODEL is set in Vercel to a v1.6 value, it STILL
 * wins here by design. To fully realise the v2.1 lock, that env var must be unset or
 * set to a v2.1 model.
 */

/** The locked video PRIMARY default (env `REPLICATE_VIDEO_MODEL` overrides per-deploy). */
export const VIDEO_PRIMARY_MODEL = 'kwaivgi/kling-v2.1';

/** Deliberate cheaper fallback for the fail-open cascade — never the default. */
export const VIDEO_LAST_RESORT_MODEL = 'kwaivgi/kling-v1.6-standard';

/**
 * Env-resolved primary for module-load consumers that read `process.env` directly.
 * (Paths that accept an injected env object should use `VIDEO_PRIMARY_MODEL` as the
 * default instead, to preserve their test-injectable env contract.)
 */
export const VIDEO_PRIMARY = (process.env.REPLICATE_VIDEO_MODEL || VIDEO_PRIMARY_MODEL).trim();

/** Image PRIMARY: FLUX 1.1 Pro — the `flux-pro` key in lib/replicate/models.ts. */
export const IMAGE_PRIMARY_MODEL_KEY = 'flux-pro';
