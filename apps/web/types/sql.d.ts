/**
 * The migrations are imported as strings, via the `asset/source` rule in
 * next.config.mjs, so the schema is baked into the build rather than read from
 * disk at runtime.
 */
declare module '*.sql' {
  const content: string;
  export default content;
}
