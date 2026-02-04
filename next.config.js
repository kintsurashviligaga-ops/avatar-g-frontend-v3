/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'dist',
  images: {
    unoptimized: true,
  },
  swcMinify: true,
  experimental: {
    optimizeCss: true,
  },
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // API Routes-ისთვის სტატიკური ექსპორტის გამორთვა
  trailingSlash: true,
}

module.exports = nextConfig
