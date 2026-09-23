/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite is a WASM build of Postgres. It must stay a real Node module on the
  // server rather than being bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  transpilePackages: ['@guy/shared'],

  webpack: (config, { nextRuntime }) => {
    // Next compiles instrumentation.ts for the edge runtime as well as for
    // Node, even though register() returns immediately unless it is running on
    // Node. Webpack still follows the import into lib/db.ts, hits `node:fs`,
    // and fails the build for every page. Nothing here ever runs on edge, so
    // these are marked external rather than bundled.
    if (nextRuntime === 'edge') {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        'node:fs',
        'node:path',
        'node:url',
        '@electric-sql/pglite',
      ];
    }
    return config;
  },
};

export default nextConfig;
