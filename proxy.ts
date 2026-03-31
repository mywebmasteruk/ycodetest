import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseCookieOptionsForRequestHeaders } from '@/lib/supabase-cookie-domain';
import {
  getSupabaseEnvConfig,
  isPublicApiRoute,
  isPublicPage,
} from '@/lib/tenant';

/**
 * Verify Supabase session for protected API routes.
 * Returns a 401 response if not authenticated, or null to continue.
 */
async function verifyApiAuth(request: NextRequest): Promise<NextResponse | null> {
  if (isPublicApiRoute(request.nextUrl.pathname, request.method)) {
    return null;
  }

  const config = getSupabaseEnvConfig();

  // If env vars aren't set (pre-setup or local dev without .env.local), let through
  if (!config) return null;

  let response = NextResponse.next({ request });

  const cookieOpts = supabaseCookieOptionsForRequestHeaders(request.headers);

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
    ...(cookieOpts ? { cookieOptions: cookieOpts } : {}),
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect API and preview routes with auth
  if (pathname.startsWith('/ycode/api') || pathname.startsWith('/ycode/preview')) {
    const authResponse = await verifyApiAuth(request);
    if (authResponse) {
      if (pathname.startsWith('/ycode/preview')) {
        return NextResponse.redirect(new URL('/ycode', request.url));
      }
      return authResponse;
    }
  }

  const hasPaginationParams = Array.from(request.nextUrl.searchParams.keys())
    .some((key) => key.startsWith('p_'));

  if (isPublicPage(pathname) && hasPaginationParams) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathname === '/' ? '/dynamic' : `/dynamic${pathname}`;

    const rewriteResponse = NextResponse.rewrite(rewriteUrl);
    rewriteResponse.headers.set('x-pathname', pathname);
    return rewriteResponse;
  }

  // Create response
  const response = NextResponse.next();

  // Add pathname header for layout to determine dark mode
  response.headers.set('x-pathname', pathname);

  // Cache-Control for public pages is configured centrally via next.config.ts headers().

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
