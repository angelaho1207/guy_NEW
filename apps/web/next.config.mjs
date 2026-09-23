/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite is a WASM build of Postgres. It must stay a real Node module on the
  // server rather than being bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  transpilePackages: ['@guy/shared'],

  webpack: (config, { nextRuntime }) => {
    // The migrations are imported as strings and baked into the build.
    //
    // They used to be read from disk at runtime, which worked locally and
    // would have failed the moment this was deployed: a serverless bundle
    // contains the files the build traced through imports, and `supabase/` is
    // outside the app and reached only through fs. Importing them means the
    // schema travels with the code.
    config.module.rules.push({
      test: /\.sql$/,
      type: 'asset/source',
    });

    // Next compiles instrumentation.ts for the edge runtime as well as for
    // Node, even though register() returns immediately unless it is running on
    // Node. Webpack still follows the import into lib/db.ts. Nothing here ever
    // runs on edge, so PGlite is marked external rather than bundled.
    if (nextRuntime === 'edge') {
      config.externals = [
        ...(Array.isArray(config.externals)
          ? config.externals
          : [config.externals].filter(Boolean)),
        '@electric-sql/pglite',
      ];
    }

    return config;
  },
};

export default nextConfig;
