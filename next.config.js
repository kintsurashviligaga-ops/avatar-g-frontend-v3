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
// Tightly scoped to prevent XSS, clickjacking, and data exfiltration.
// Supabase, Stripe, OpenAI CDN, Google Fonts, and self-hosted assets allowed.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Scripts: self + Stripe.js + Google Tag Manager
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com",
  // Styles: self + Google Fonts + inline (required by Tailwind & framer-motion)
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Fonts: self + Google Fonts CDN
  "font-src 'self' https://fonts.gstatic.com data:",
  // Images: self + Supabase storage + Cloudflare R2 + Stripe + placehold.co
  "img-src 'self' blob: data: https://*.supabase.co https://*.r2.cloudflarestorage.com https://placehold.co https://js.stripe.com",
  // Connect: API calls — self + Supabase + OpenAI + Replicate + ElevenLabs + Stripe + Upstash + PostHog + Sentry + Vercel Analytics
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.replicate.com https://api.elevenlabs.io https://api.stripe.com https://*.upstash.io https://www.google-analytics.com https://app.posthog.com https://us.i.posthog.com https://o*.ingest.sentry.io https://vitals.vercel-insights.com",
  // Frames: only Stripe iframes allowed (for Stripe Elements)
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  // Media: self + blob (for audio/video previews)
  "media-src 'self' blob: https://*.supabase.co https://*.r2.cloudflarestorage.com",
  // Workers: self (for service workers)
  "worker-src 'self' blob:",
  // Manifests
  "manifest-src 'self'",
  // Form actions: self only
  "form-action 'self'",
  // Base URI: prevent base tag injection
  "base-uri 'self'",
  // Object/embed: disallow plugins
  "object-src 'none'",
].join('; ');

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
    serverComponentsExternalPackages: ['ffmpeg-static'],
    outputFileTracingIncludes: {
      '/api/video/assemble': ['./node_modules/ffmpeg-static/**'],
      '/api/video/assemble/selftest': ['./node_modules/ffmpeg-static/**'],
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
  async headers() {
    return [
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
          // Prevent embedding in iframes (clickjacking)
          { key: 'X-Frame-Options', value: 'DENY' },
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
