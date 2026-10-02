import { NextResponse } from 'next/server';
import { asAdmin, usingSupabase } from '@/lib/db';

/**
 * Is this deployment actually working?
 *
 * Exists because diagnosing a 500 took dozens of requests and a lot of
 * guessing: every page failed, static files did not, and nothing said why. This
 * answers in one request.
 *
 * Deliberately says nothing a stranger could use — no connection string, no
 * host, no error text, no counts. Just which of the two things that break is
 * broken: the app cannot see a database, or it can see one and cannot reach it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!usingSupabase) {
    // In production this is the dangerous one: the app silently falls back to a
    // throwaway in-memory database, which is right for a fresh clone and wrong
    // on a deployment.
    return NextResponse.json(
      { ok: false, database: 'not configured', hint: 'SUPABASE_DB_URL is missing' },
      { status: 503 },
    );
  }

  const started = Date.now();
  try {
    await asAdmin('select 1 as ok');
    return NextResponse.json({ ok: true, database: 'reachable', ms: Date.now() - started });
  } catch {
    return NextResponse.json(
      { ok: false, database: 'unreachable', ms: Date.now() - started },
      { status: 503 },
    );
  }
}
