/* eslint-disable @typescript-eslint/no-require-imports */
const withNextIntl = require('next-intl/plugin')('./i18n/request.ts');
const { warnIfOneDrivePath } = require('./scripts/onedrive-warning.cjs');

warnIfOneDrivePath();
const buildVersion = process.env.NEXT_PUBLIC_BUILD_ID || String(Date.now());

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
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', '@supabase/supabase-js'],
  },
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
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
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
      { from: 'tourism-agent', to: 'agent-g' },
      { from: 'affiliate-marketplace-layer', to: 'shop' },
      { from: 'auto-dropshipping-logic', to: 'shop' },
      { from: 'tokenized-digital-goods-system', to: 'shop' },
    ];

    return serviceRedirects.flatMap(({ from, to }) => [
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
    ]);
  },
}

module.exports = withNextIntl(nextConfig)
