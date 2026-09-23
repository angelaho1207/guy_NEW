/**
 * Warms the dev database before the first request.
 *
 * Booting Postgres and applying the migrations is a couple of seconds of solid
 * WebAssembly work. Doing that inside a request meant blocking while Next was
 * already streaming a response, which fails in a way that has nothing to do
 * with the query. Next runs this once at startup, which is where that work
 * belongs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { warm } = await import('./lib/db');
  const started = Date.now();
  await warm();
  console.log(`  ◆ Guy dev database ready in ${Date.now() - started}ms`);
}
