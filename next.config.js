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
      { from: 'video-factory', to: 'video-studio' },
      { from: 'image-architect', to: 'image-creator' },
      { from: 'script-writer', to: 'text-intelligence' },
      { from: 'social-content-factory', to: 'social-media' },
      { from: 'business-agents', to: 'business-agent' },
      { from: 'tourism-agent', to: 'agent-g' },
      { from: 'affiliate-marketplace-layer', to: 'marketplace' },
      { from: 'auto-dropshipping-logic', to: 'online-shop' },
      { from: 'tokenized-digital-goods-system', to: 'marketplace' },
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
