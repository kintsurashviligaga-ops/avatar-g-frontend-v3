const withNextIntl = require('next-intl/plugin')('./i18n/request.ts');
const { warnIfOneDrivePath } = require('./scripts/onedrive-warning.cjs');

warnIfOneDrivePath();

/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'example.com' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
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
