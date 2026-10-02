import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Keeps the session cookie fresh, and decides who may see what.
 *
 * Server components cannot write cookies, so a refreshed token would be
 * discarded without this. It also means a page can assume there is somebody
 * signed in, rather than every page checking.
 *
 * With no Supabase configured the app runs on the demo database, which has no
 * accounts at all, so this steps aside entirely.
 */

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  // Recovery happens while signed out, and /auth/confirm is what turns the
  // emailed token into the session that /reset then needs.
  '/forgot',
  '/auth/confirm',
  // Readable by anyone, including the app stores, which require a reachable
  // policy before they will review anything.
  '/privacy',
  // The browser fetches this to decide whether the app is installable, and it
  // does not always carry a session when it does. Behind the sign-in redirect it
  // came back as a redirect to /login, and Add to Home Screen quietly stopped
  // being offered.
  '/manifest.webmanifest',
];

export async function middleware(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase rather than trusting what is
  // in the cookie. Do not swap it for getSession() here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Carried so a scanned connect code survives signing in. Codes last two
    // minutes, so losing one to a redirect means losing the connection.
    url.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/contacts';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|webp)$).*)'],
};
