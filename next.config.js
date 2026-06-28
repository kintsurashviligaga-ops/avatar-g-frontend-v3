/* eslint-disable @typescript-eslint/no-require-imports */
const withNextIntl = require('next-intl/plugin')('./i18n/request.ts');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});
const { withSentryConfig } = require('@sentry/nextjs');

const buildVersion = process.env.NEXT_PUBLIC_BUILD_ID || String(Date.now());
const isDev = process.env.NODE_ENV === 'development';

// ─── Content Security Policy ─────────────────────────────────────────────────
// Tightly scoped to prevent XSS, clickjacking, and data exfiltration. Extracted
// into lib/security/csp.js so the directive set is unit-tested (PHASE 48 §2),
// which is how the `data:` media-src regression — inline data:video/audio
// previews blocked from playback — is now locked down against re-introduction.
const { CSP_DIRECTIVES } = require('./lib/security/csp');

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildVersion,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'example.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400, // 24h
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@supabase/supabase-js',
      '@tanstack/react-query',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
    ],
    // ffmpeg-static ships a native binary — don't let webpack bundle it; load it
    // from node_modules at runtime and force-trace it into the assemble lambda
    // so the CPU FFmpeg fallback (Option B) has its binary in production.
    serverComponentsExternalPackages: ['ffmpeg-static', 'sharp', '@resvg/resvg-js', 'pdf-parse', 'mammoth'],
    outputFileTracingIncludes: {
      '/api/video/assemble': ['./node_modules/ffmpeg-static/**'],
      '/api/orchestrator/produce': ['./node_modules/ffmpeg-static/**'],
      // Music voice-clone transcodes the uploaded voice to mp3 (+ loops short clips)
      // via ffmpeg-static before MiniMax — its binary must ride along in this lambda too.
      '/api/ai/music': ['./node_modules/ffmpeg-static/**'],
      // Voice training splits the uploaded voice into a wav dataset with ffmpeg-static.
      '/api/voice/train': ['./node_modules/ffmpeg-static/**'],
      // Georgian-song builder mixes the cloned-voice vocal OVER a funk bed with
      // ffmpeg-static — without this the binary is absent in the lambda, the mix
      // exec ENOENTs, and the route silently fail-opens to the English path.
      '/api/audio/georgian-song': ['./node_modules/ffmpeg-static/**'],
      // The runtime migration gate reads raw .sql by path at request time. Next
      // only bundles files it can statically trace, so without this the lambda's
      // /var/task has no supabase/migrations/*.sql (ENOENT on POST). Force-trace
      // both migration dirs so the turnkey `run-migration` curl works in prod.
      '/api/admin/run-migration': ['./supabase/migrations/**', './migrations/**'],
      // B2B marketing overlays: ffmpeg-static binary + @resvg (SVG→PNG with an EXPLICIT font
      // buffer + its native bins) ride along so the lambda renders the overlay PNG + composites.
      '/api/pipeline/overlay': ['./node_modules/ffmpeg-static/**', './node_modules/@resvg/**'],
      // Music-Video graphics agent: equalizer (ffmpeg) + title/lower-third (resvg SVG→PNG).
      '/api/video/graphics': ['./node_modules/ffmpeg-static/**', './node_modules/@resvg/**'],
      // Video Remix: EVERY ffmpeg op (color_grade/speed/trim/mux/Ken-Burns) + captions
      // (overlayMasterUrl → resvg SVG→PNG) runs here. Without the binary + resvg the
      // lambda ENOENTs and every remix silently fails — the users' "broken remix".
      '/api/video/remix': ['./node_modules/ffmpeg-static/**', './node_modules/@resvg/**'],
      // Motion Control: the optional background-music pass muxes a MusicGen bed onto the
      // Kling clip via ffmpeg-static (muxAudioOntoVideo). The mux now runs in the async
      // /status finalize poll (not the submit-only POST), so the binary must ride along
      // in THAT lambda — without it the mux ENOENTs and the music is silently dropped.
      '/api/motion-control': ['./node_modules/ffmpeg-static/**'],
      '/api/motion-control/status': ['./node_modules/ffmpeg-static/**'],
    },
  },
  eslint: {
    // Lint is run separately in CI; skip during `next build` to avoid OOM on large codebases
    ignoreDuringBuilds: true,
  },
  // Strip console.* in production except error/warn — keeps Sentry-routed
  // reportError() noise out of the browser dev console while preserving
  // genuine failure logs that operators still want visible.
  compiler: isDev ? undefined : {
    removeConsole: { exclude: ['error', 'warn'] },
  },
  staticPageGenerationTimeout: 180,
  // Compress responses
  compress: true,
  // Power by header leaks server info
  poweredByHeader: false,
  // Silence the benign "Critical dependency: require function is used…" warning
  // emitted by @sentry/nextjs → @opentelemetry/instrumentation → require-in-the-middle
  // (dynamic require for runtime instrumentation; expected, not a real issue) so the
  // production build output stays pristine.
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /require-in-the-middle/ },
      { module: /@opentelemetry[/\\]instrumentation/ },
      { message: /Critical dependency: require function is used/ },
    ];
    return config;
  },
  async headers() {
    return [
      {
        // The service worker must never be HTTP-cached, or clients keep running an
        // old SW that serves a stale app shell + assets (the "deploy did nothing"
        // class of bug). Force a re-check on every load.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Only disable caching for API routes - let Next.js manage SSG/ISR caching
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'x-build-id', value: buildVersion },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'x-build-id', value: buildVersion },
          // Clickjacking protection — SAMEORIGIN (not DENY) so the One-Window
          // studio can render its OWN pages (legal / help / library) inside the
          // StudioSheet iframe. DENY blocked every frame, leaving those panels
          // blank when opened from the drawer. Cross-origin framing stays blocked.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Restrict browser features
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          // HSTS — enforce HTTPS for 1 year (enable after confirming HTTPS-only)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // Content Security Policy
          ...(!isDev ? [{ key: 'Content-Security-Policy', value: CSP_DIRECTIVES }] : []),
          // Cross-origin isolation for SharedArrayBuffer (required for WASM/video workers)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Apple App Site Association (AASA) for iOS Universal Links. Served as JSON
      // by app/api/aasa/route.ts. The middleware already exempts /.well-known/
      // from locale routing, so Apple fetches it without a redirect.
      { source: '/.well-known/apple-app-site-association', destination: '/api/aasa' },
      { source: '/apple-app-site-association', destination: '/api/aasa' },
    ];
  },
  async redirects() {
    const serviceRedirects = [
      // Legacy full-slug → canonical short-slug
      { from: 'avatar-builder', to: 'avatar' },
      { from: 'video-studio', to: 'video' },
      { from: 'music-studio', to: 'music' },
      { from: 'photo-studio', to: 'photo' },
      { from: 'image-creator', to: 'image' },
      { from: 'text-intelligence', to: 'text' },
      { from: 'prompt-builder', to: 'prompt' },
      { from: 'game-creation', to: 'game' },
      { from: 'interior-design', to: 'interior' },
      { from: 'terminal-coding', to: 'software' },
      { from: 'online-shop', to: 'shop' },
      { from: 'workflow-builder', to: 'workflow' },
      { from: 'media-production', to: 'media' },
      { from: 'visual-intelligence', to: 'visual-intel' },
      { from: 'social-media-manager', to: 'editing' },
      // Older legacy names
      { from: 'video-factory', to: 'video' },
      { from: 'image-architect', to: 'image' },
      { from: 'script-writer', to: 'text' },
      { from: 'social-content-factory', to: 'editing' },
      { from: 'business-agents', to: 'agent-g' },
      { from: 'business-agent', to: 'agent-g' },
      { from: 'tourism-agent', to: 'agent-g' },
      { from: 'voice-lab', to: 'agent-g' },
      { from: 'game-creator', to: 'agent-g' },
      { from: 'social-media', to: 'editing' },
      { from: 'affiliate-marketplace-layer', to: 'shop' },
      { from: 'auto-dropshipping-logic', to: 'shop' },
      { from: 'tokenized-digital-goods-system', to: 'shop' },
    ];

    // /:locale/<slug> → /:locale/services/<slug> for the four media services.
    // Users type /ka/voice etc directly; without this they 404. /ka/avatar/[id] is
    // unaffected — Next redirects match exact path depth.
    //
    // CRITICAL: constrain :locale to the actual locales (ka|en|ru). Without the
    // regex constraint, ":locale" matches greedily and redirects /api/avatar
    // to /api/services/avatar (which is empty), breaking the avatar API.
    const shortSlugRedirects = ['voice', 'music', 'video', 'avatar'].map((slug) => ({
      source: `/:locale(ka|en|ru)/${slug}`,
      destination: `/:locale/services/${slug}`,
      permanent: false,
    }));

    return [
      ...serviceRedirects.flatMap(({ from, to }) => [
        {
          source: `/services/${from}`,
          destination: `/services/${to}`,
          permanent: true,
        },
        {
          source: `/:locale/services/${from}`,
          destination: `/:locale/services/${to}`,
          permanent: true,
        },
      ]),
      ...shortSlugRedirects,
    ];
  },
};

const sentryConfig = {
  // Upload source maps only when SENTRY_AUTH_TOKEN is set
  silent: true,
  org: process.env.SENTRY_ORG || 'myavatar-ge',
  project: process.env.SENTRY_PROJECT || 'avatar-g-frontend',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
};

// Only wrap with Sentry if auth token is present (avoids build errors without token)
const sentryWrapped = process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withBundleAnalyzer(withNextIntl(nextConfig)), sentryConfig)
  : withBundleAnalyzer(withNextIntl(nextConfig));

module.exports = sentryWrapped;
