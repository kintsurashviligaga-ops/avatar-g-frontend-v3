/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * PHASE 48 §2 — Content Security Policy, extracted into a testable module.
 *
 * Lives in plain CommonJS (not TS) so `next.config.js` can `require()` it at
 * build time AND Jest can import it to lock the directives down with assertions.
 *
 * THE PRODUCTION BUG THIS FIXES
 * -----------------------------
 * The generated-media pipeline returns finished clips, the music score and the
 * voiceover as INLINE `data:` URLs (`data:video/mp4;base64,…`, `data:audio/…`).
 * The previous `media-src` allow-list was:
 *
 *     media-src 'self' blob: https://*.supabase.co https://*.r2.cloudflarestorage.com
 *
 * It omitted the `data:` scheme, so every `<video>` / `<audio>` element whose
 * source was an inline data URL was BLOCKED by the browser's CSP — the asset
 * never decoded, so the only way a user could see it was the JS download path
 * (fetch → Blob), which is not subject to `media-src`. That is the exact
 * "images/audio/video freeze unless downloaded" symptom from the live audit.
 *
 * `img-src` already carried `data:` (so data-URL images rendered), which is why
 * the regression was media-only. We add `data:` to `media-src`, plus the
 * provider asset CDN (`*.replicate.delivery`) that hosts non-inline outputs,
 * across `img-src` / `media-src` / `connect-src` (the download path fetches it).
 */

/**
 * Build the CSP directive map. Returned as an object keyed by directive so it
 * is trivially assertable in tests; `serializeCsp` joins it into a header value.
 */
function cspDirectiveMap() {
  return {
    'default-src': ["'self'"],
    // Scripts: self + Stripe.js + Google Tag Manager
    'script-src': [
      "'self'",
      "'unsafe-eval'",
      "'unsafe-inline'",
      'https://js.stripe.com',
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
    ],
    // Styles: self + Google Fonts + inline (required by Tailwind & framer-motion)
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    // Fonts: self + Google Fonts CDN + inline data: fonts
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    // Images: self + inline data/blob + Supabase + R2 + Replicate CDN + Stripe + placeholders
    'img-src': [
      "'self'",
      'blob:',
      'data:',
      'https://*.supabase.co',
      // Google OAuth profile pictures (avatar_url can be a Google-hosted URL for SSO
      // users) — without this the avatar <img> is CSP-blocked and never renders.
      'https://*.googleusercontent.com',
      'https://*.r2.cloudflarestorage.com',
      'https://*.replicate.delivery',
      // PHASE 51 §2 — LTX video service + its GCP-hosted output bucket. The
      // JSON LTX path returns hosted asset URLs on these origins; without them
      // the browser blocks the poster/frame fetch.
      'https://api.ltx.video',
      'https://storage.googleapis.com',
      // HeyGen output CDN — also referenced as <img> posters in some flows.
      'https://files2.heygen.ai',
      'https://placehold.co',
      'https://js.stripe.com',
    ],
    // Connect: API calls + the download path fetching hosted provider assets
    'connect-src': [
      "'self'",
      // The browser uploader does fetch(dataURL) to turn an attached photo into a blob,
      // and the download/share path does fetch(blobURL) — both are local (no network) but
      // are still gated by connect-src. WITHOUT these, every "attach a photo" upload (and
      // thus lip-sync) is silently CSP-blocked. They expose nothing (inline/local data).
      'data:',
      'blob:',
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://api.openai.com',
      'https://api.replicate.com',
      'https://*.replicate.delivery',
      // PHASE 51 §2 — fetch (download path) of LTX-hosted MP4 outputs.
      'https://api.ltx.video',
      'https://storage.googleapis.com',
      // Gemini Multimodal Live: the browser opens a DIRECT WebSocket to Google (voice mode) and the
      // client half may hit the REST endpoint too. WITHOUT these, that wss:// connection is CSP-blocked
      // and Safari reports the misleading "The operation is insecure." — which is exactly why live voice
      // failed. (The ephemeral token is still minted server-side; only the socket is browser-direct.)
      'https://generativelanguage.googleapis.com',
      'wss://generativelanguage.googleapis.com',
      // HeyGen output CDN — the in-chat Download/Share flow fetches the rendered
      // presenter mp4 to turn it into a blob before saving / sharing.
      'https://files2.heygen.ai',
      'https://api.elevenlabs.io',
      'https://api.stripe.com',
      'https://*.upstash.io',
      'https://www.google-analytics.com',
      'https://app.posthog.com',
      'https://us.i.posthog.com',
      'https://o*.ingest.sentry.io',
      'https://vitals.vercel-insights.com',
    ],
    // Frames: only Stripe iframes allowed (for Stripe Elements)
    'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
    // Frame-ancestors: the modern clickjacking control. 'self' lets the One-Window
    // studio embed its OWN pages (legal / help / library) in the StudioSheet iframe
    // while blocking every cross-origin framer — pairs with X-Frame-Options:SAMEORIGIN.
    'frame-ancestors': ["'self'"],
    // Media: self + inline data:/blob: (generated clips, music, VO) + storage + Replicate.
    // PHASE 48 §2 — `data:` is REQUIRED here: the pipeline mounts inline
    // data:video/mp4 and data:audio/* into native <video>/<audio>. Without it
    // the browser blocks inline playback and the asset only opens via download.
    'media-src': [
      "'self'",
      'blob:',
      'data:',
      'https://*.supabase.co',
      'https://*.r2.cloudflarestorage.com',
      'https://*.replicate.delivery',
      // PHASE 51 §2 — native <video> playback of LTX-hosted MP4 outputs (the
      // JSON path serves these directly; the binary path is re-hosted to
      // *.supabase.co, already allowed above).
      'https://api.ltx.video',
      'https://storage.googleapis.com',
      // HeyGen output CDN — talking_photo / presenter renders are returned as
      // signed mp4 URLs on this host and played back natively inline. Without it
      // the browser errors with MEDIA_ELEMENT_ERROR (SRC_NOT_SUPPORTED).
      'https://files2.heygen.ai',
    ],
    // Workers: self (for service workers)
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
}

/** Serialize the directive map into a single CSP header string. */
function serializeCsp(map) {
  return Object.entries(map)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

const CSP_DIRECTIVES = serializeCsp(cspDirectiveMap());

module.exports = { cspDirectiveMap, serializeCsp, CSP_DIRECTIVES };
