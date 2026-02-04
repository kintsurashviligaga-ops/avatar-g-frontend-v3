/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig

// Force complete rebuild - 2026-01-27 23:13
// Clear all caches and regenerate bundle
// Bypass Vercel build cache
// Trigger rebuild - 2026-01-29 19:10
