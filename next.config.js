/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { 
    ignoreBuildErrors: true 
  },
  eslint: { 
    ignoreDuringBuilds: true 
  },
  swcMinify: true,
  images: {
    unoptimized: true
  },
  // Remove output: 'export' for Vercel serverless deployment
  // Remove distDir: 'dist' to use default .next directory
}

module.exports = nextConfig
