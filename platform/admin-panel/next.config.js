/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Force webpack to watch all files with polling
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.watchOptions = {
        poll: 500, // Check every 500ms for faster updates
        aggregateTimeout: 200,
        ignored: ['**/node_modules/**', '**/.git/**'],
      };
      // Ensure webpack is in watch mode
      config.infrastructureLogging = {
        level: 'error',
      };
    }
    return config;
  },
  // Enable Fast Refresh
  experimental: {
    // Disable webpackBuildWorker as it can interfere with hot reload
  },
}

module.exports = nextConfig

