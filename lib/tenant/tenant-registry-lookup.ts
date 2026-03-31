/**
 * Resolve tenant id/slug from tenant_registry via Supabase REST (service role).
 * Used by proxy.ts; cached briefly to limit latency on hot paths.
 */

import { getSupabaseEnvConfig } from '@/lib/tenant/middleware-utils';

const tenantCache = new Map<string, { id: string; slug: string; ts: number }>();
const CACHE_TTL_MS = 60_000;

export async function lookupTenant(
  slug: string,
  allowProvisioning = false,
): Promise<{ id: string; slug: string } | null> {
  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { id: cached.id, slug: cached.slug };
  }

  const envConfig = getSupabaseEnvConfig();
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
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
