/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Disable TypeScript errors during build for now
    ignoreBuildErrors: true,
  },
  env: {
    // Define any environment variables needed
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost',
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
    TENDERLY_ACCESS_KEY: process.env.TENDERLY_ACCESS_KEY,
    TENDERLY_USER: process.env.TENDERLY_USER,
    TENDERLY_PROJECT: process.env.TENDERLY_PROJECT,
    RPC_URL: process.env.RPC_URL,
    FACTORY_ADDRESS: process.env.FACTORY_ADDRESS,
    ENTRYPOINT_ADDRESS: process.env.ENTRYPOINT_ADDRESS,
    ACTIVE_CHAIN: process.env.ACTIVE_CHAIN,
    KEY_ENCRYPTION_KEY: process.env.KEY_ENCRYPTION_KEY,
    PIMLICO_API_KEY: process.env.PIMLICO_API_KEY,
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