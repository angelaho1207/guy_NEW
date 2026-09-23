/** @type {import('next').NextConfig} */
const nextConfig = {
  // Both of these must stay real Node modules on the server rather than being
  // bundled. PGlite is a WebAssembly build of Postgres, and `pg` loads `fs`
  // conditionally at runtime in a way webpack cannot follow.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
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

    // Next compiles instrumentation.ts for the edge runtime too, because the
    // middleware runs there. Webpack follows the import into lib/db.ts and
    // hits the database drivers, which cannot exist on edge.
    //
    // They are aliased to empty modules rather than marked external. An
    // external would have webpack emit the package name as a bare identifier,
    // producing a bundle that is not valid JavaScript. Nothing here ever runs
    // on edge, so an empty module is exactly right.
    if (nextRuntime === 'edge') {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        '@electric-sql/pglite': false,
        pg: false,
      };
    }

    return config;
  },
};

export default nextConfig;
