import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { CookieOptions } from '@supabase/ssr';
import { credentials } from '@/lib/credentials';
import { cookies } from 'next/headers';
import { supabaseCookieOptionsForHost } from '@/lib/supabase-cookie-domain';

/**
 * GET /ycode/api/auth/callback
 * 
 * Handle OAuth callback from Supabase Auth
 * (For future OAuth implementation)
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    try {
      // Get Supabase config
      const config = await credentials.get<{
        url: string;
        anonKey: string;
        serviceRoleKey: string;
      }>('supabase_config');

      if (!config) {
        return NextResponse.redirect(
          new URL('/login?error=config', request.url)
        );
      }

      const cookieStore = await cookies();
      const host = request.headers.get('host') || '';
      const cookieOpts = supabaseCookieOptionsForHost(
        host,
        process.env.TENANT_DOMAIN_SUFFIX || process.env.NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX,
      );

      // Create Supabase client
      const supabase = createServerClient(
        config.url,
        config.anonKey,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
            set(name: string, value: string, options: CookieOptions) {
              cookieStore.set({ name, value, ...options });
            },
            remove(name: string, options: CookieOptions) {
              cookieStore.set({ name, value: '', ...options });
            },
          },
          ...(cookieOpts ? { cookieOptions: cookieOpts } : {}),
        }
      );

      // Exchange code for session
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Auth callback error:', error);
        return NextResponse.redirect(
          new URL('/login?error=auth', request.url)
        );
      }

      // Redirect to builder
      return NextResponse.redirect(new URL('/ycode', request.url));
    } catch (error) {
      console.error('Auth callback failed:', error);
      return NextResponse.redirect(
        new URL('/login?error=server', request.url)
      );
    }
  }

  // No code provided - redirect to login
  return NextResponse.redirect(new URL('/login', request.url));
}
