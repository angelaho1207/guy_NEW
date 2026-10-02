// The dev server, on the throwaway demo database.
//
// Why this exists: the demo database seeds four people, a follow-up and a 1:1
// through the real functions, so every screen has something on it. A real
// account that has not met anyone shows empty states and nothing else, which
// makes the UI impossible to look at. This is how the design gets reviewed.
//
// It runs on its own port AND its own build directory, so it can sit beside
// `npm run dev` rather than corrupting it. See `distDir` in next.config.mjs.
//
// A Node script rather than an inline env assignment because `VAR= cmd` is not
// portable to Windows shells, and a dependency for that would be silly.

import { spawn } from 'node:child_process';

const PORT = process.env.PORT ?? '3001';

// Next's env loader leaves variables already present in process.env alone, so
// setting these to empty here beats whatever .env.local says. Empty is what
// `usingSupabase` in lib/db.ts checks for.
const env = {
  ...process.env,
  SUPABASE_DB_URL: '',
  NEXT_PUBLIC_SUPABASE_URL: '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  GUY_DIST_DIR: '.next-demo',
};

console.log(`demo database, seeded, on http://localhost:${PORT}`);
console.log('nothing typed into it survives a restart, which is the point\n');

const child = spawn('npx', ['next', 'dev', '-p', PORT], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
