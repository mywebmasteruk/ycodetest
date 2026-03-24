import { NextResponse, type NextRequest } from 'next/server';

const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'api', 'mail', 'ftp']);
const TENANT_DOMAIN_SUFFIX = process.env.TENANT_DOMAIN_SUFFIX || 'masjidweb.com';

const tenantCache = new Map<string, { id: string; slug: string; ts: number }>();
const CACHE_TTL_MS = 60_000;

async function lookupTenant(slug: string): Promise<{ id: string; slug: string } | null> {
  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { id: cached.id, slug: cached.slug };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const qs = new URLSearchParams({
      slug: `eq.${slug}`,
      status: 'eq.active',
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

function extractSubdomain(host: string): string | null {
  const lower = host.toLowerCase().replace(/:\d+$/, '');
  if (!lower.endsWith(`.${TENANT_DOMAIN_SUFFIX}`)) return null;
  const sub = lower.slice(0, -(TENANT_DOMAIN_SUFFIX.length + 1));
  if (!sub || sub.includes('.') || RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const subdomain = extractSubdomain(host);
  if (!subdomain) return NextResponse.next();

  const tenant = await lookupTenant(subdomain);
  if (!tenant) {
    return new NextResponse('Tenant not found', { status: 404 });
  }

  const headers = new Headers(request.headers);
  headers.set('x-tenant-id', tenant.id);
  headers.set('x-tenant-slug', tenant.slug);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot)$).*)'],
};
