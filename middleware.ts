import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  extractSubdomain,
  isPublicApiRoute,
  getSupabaseEnvConfig,
  isPublicPage,
} from '@/lib/tenant/middleware-utils';
import { supabaseCookieOptionsForHost } from '@/lib/supabase-cookie-domain';

// ── Multi-tenant subdomain resolution ───────────────────────────────────────

const TENANT_DOMAIN_SUFFIX = process.env.TENANT_DOMAIN_SUFFIX || '';

/** Subdomain for the template / demo editor (default: manage). */
const MASTER_BUILDER_SUBDOMAIN = (
  process.env.MASTER_BUILDER_SUBDOMAIN || 'manage'
).toLowerCase();

const tenantCache = new Map<string, { id: string; slug: string; ts: number }>();
const CACHE_TTL_MS = 60_000;

async function lookupTenant(
  slug: string,
  allowProvisioning = false,
): Promise<{ id: string; slug: string } | null> {
  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { id: cached.id, slug: cached.slug };
  }

  const envConfig = getSupabaseEnvConfig();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!envConfig || !key) return null;
  const url = envConfig.url;

  try {
    const qs = new URLSearchParams({
      slug: `eq.${slug}`,
      status: allowProvisioning ? 'in.(active,provisioning)' : 'eq.active',
      select: 'id,slug',
      limit: '1',
    });
    const res = await fetch(`${url}/rest/v1/tenant_registry?${qs}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { id: string; slug: string }[];
    if (!rows.length) return null;
    tenantCache.set(slug, { ...rows[0], ts: Date.now() });
    return rows[0];
  } catch {
    return null;
  }
}

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

  const authHost = request.headers.get('host') || '';
  const cookieOpts = supabaseCookieOptionsForHost(authHost, TENANT_DOMAIN_SUFFIX);

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Tenant subdomain resolution ──
  const host = request.headers.get('host') || '';
  const subdomain = extractSubdomain(host, TENANT_DOMAIN_SUFFIX);

  const provisioningSecret = process.env.PROVISIONING_WEBHOOK_SECRET;
  const isProvisionPublish =
    request.method === 'POST' &&
    pathname === '/ycode/api/publish' &&
    !!provisioningSecret &&
    request.headers.get('x-provisioning-secret') === provisioningSecret;

  if (subdomain) {
    if (subdomain === MASTER_BUILDER_SUBDOMAIN) {
      const masterId = process.env.TEMPLATE_TENANT_ID?.trim();
      if (masterId) {
        request.headers.set('x-tenant-id', masterId);
        request.headers.set('x-tenant-slug', MASTER_BUILDER_SUBDOMAIN);
      } else {
        const tenant = await lookupTenant(subdomain, isProvisionPublish);
        if (!tenant) {
          return new NextResponse(
            'Master builder: set TEMPLATE_TENANT_ID (template tenant UUID) or add an active tenant_registry row for the demo slug (e.g. masjidemo1).',
            { status: 503 },
          );
        }
        request.headers.set('x-tenant-id', tenant.id);
        request.headers.set('x-tenant-slug', tenant.slug);
      }
    } else {
      const tenant = await lookupTenant(subdomain, isProvisionPublish);
      if (!tenant) {
        return new NextResponse('Tenant not found', { status: 404 });
      }
      request.headers.set('x-tenant-id', tenant.id);
      request.headers.set('x-tenant-slug', tenant.slug);
    }
  } else if (isProvisionPublish) {
    // Provisioning publish via internal URL — resolve tenant from X-Tenant-Slug header
    const slugHeader = request.headers.get('x-tenant-slug');
    if (slugHeader) {
      const tenant = await lookupTenant(slugHeader, true);
      if (tenant) {
        request.headers.set('x-tenant-id', tenant.id);
        request.headers.set('x-tenant-slug', tenant.slug);
      }
    }
  } else if (pathname.startsWith('/ycode')) {
    // Editor on apex / non-tenant host: resolve tenant from the user's JWT
    const sbConfig = getSupabaseEnvConfig();
    if (sbConfig) {
      try {
        const apexCookieOpts = supabaseCookieOptionsForHost(host, TENANT_DOMAIN_SUFFIX);
        const supabase = createServerClient(sbConfig.url, sbConfig.anonKey, {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll() { /* read-only in middleware */ },
          },
          ...(apexCookieOpts ? { cookieOptions: apexCookieOpts } : {}),
        });
        const { data: { user } } = await supabase.auth.getUser();
        const tid = user?.user_metadata?.tenant_id;
        if (tid) {
          request.headers.set('x-tenant-id', tid);
          request.headers.set('x-tenant-slug', user.user_metadata.tenant_slug || '');
        }
      } catch { /* no session — unauthenticated visitor */ }
    }
  }

  // Protect API and preview routes with auth
  if (pathname.startsWith('/ycode/api') || pathname.startsWith('/ycode/preview')) {
    if (!isProvisionPublish) {
      const authResponse = await verifyApiAuth(request);
      if (authResponse) {
        if (pathname.startsWith('/ycode/preview')) {
          return NextResponse.redirect(new URL('/ycode', request.url));
        }
        return authResponse;
      }
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

  // Create response, forwarding modified request headers (including x-tenant-id)
  const response = NextResponse.next({ request });

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
