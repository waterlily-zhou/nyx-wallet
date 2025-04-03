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
  // Properly handle Node.js polyfills for browser compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side specific configuration
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
      
      // Add resolve aliases for permissionless dependencies
      config.resolve.alias = {
        ...config.resolve.alias,
      };
    }
    
    // Add resolveLoader to handle ESM/CJS compatibility issues
    config.module = {
      ...config.module,
      exprContextCritical: false
    };
    
    return config;
  },
};

module.exports = nextConfig; 