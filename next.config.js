/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Disable TypeScript errors during build for now
    ignoreBuildErrors: true,
  },
  env: {
    // Define any environment variables needed
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost',
  },
  webpack: (config) => {
    // Polyfills for crypto modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      fs: false,
      path: false,
      os: false,
      net: false,
      tls: false,
      stream: false,
    };
    return config;
  },
};

module.exports = nextConfig; 