import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      crypto: false,
      stream: false,
      http: false,
      https: false,
      zlib: false,
      url: false,
      assert: false,
      util: false,
      punycode: false,
    };
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
      asyncWebAssembly: true,
    };

    // Add JSON loader
    config.module.rules.push({
      test: /\.json$/,
      type: 'json',
    });

    // Ignore node-specific modules when bundling for the browser
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
      };
    }

    return config;
  },
  // Treat these packages as external for server-side rendering
  serverExternalPackages: [
    '@solana/web3.js',
    '@coral-xyz/anchor',
  ],
};

export default nextConfig;
