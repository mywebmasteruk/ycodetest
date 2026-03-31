import { cache } from 'react';
import { headers } from 'next/headers';
import { settingsTenantIdOrNull } from '@/lib/masjidweb/settings-tenant-id';

/**
 * Single entry point for “which tenant applies to this server work?”
 *
 * ## Resolution order
 * 1. `x-tenant-id` request header — **only** set by [proxy.ts](../../proxy.ts), never trusted from the browser.
 * 2. Env fallback (no request context): `TENANT_ID`, then `MASTER_TENANT_ID`, then `TEMPLATE_TENANT_ID`
 *    via [settings-tenant-id.ts](./settings-tenant-id.ts). Use for scripts, cron, local jobs; treat as
 *    **single-tenant** unless you pass tenant explicitly elsewhere.
 *
 * ## Threat model (builder)
 * - The proxy **strips** any client-supplied `x-tenant-id` / `x-tenant-slug`, then sets them from:
 *   - **Subdomain** → `tenant_registry` lookup, or
 *   - **TEMPLATE_TENANT_ID** on the master builder host, or
 *   - **Provisioning** publish (`x-provisioning-secret` + optional slug), or
 *   - **Apex /ycode** path: Supabase session `user_metadata.tenant_id` (read-only cookie client).
 * - For authenticated `/ycode/api/*` routes, the proxy also requires JWT `user_metadata.tenant_id` to
 *   match `x-tenant-id` when both are present (see `tenant-session-alignment.ts`).
 *
 * ## Service role vs RLS
 * Repositories use `getSupabaseAdmin()` (service role), which **bypasses** Postgres RLS. Row isolation
 * depends on **explicit** `.eq('tenant_id', …)` (or helpers in `tenant-query.ts`). RLS still protects
 * direct PostgREST access with the anon key + user JWT.
 *
 * Wrapped in React `cache()` so one request resolves once (consistent reads; fewer `headers()` calls).
 *
 * ## Public site
 * Tenant for published pages should come from **hostname → tenant_registry**, not from a shared
 * deploy env default, when serving multiple tenants from one app.
 */
async function computeEffectiveTenantId(): Promise<string | null> {
  try {
    const h = await headers();
    const fromHeader = h.get('x-tenant-id')?.trim();
    if (fromHeader) return fromHeader;
  } catch {
    /* no request AsyncLocalStorage context */
  }
  return settingsTenantIdOrNull();
}

export const resolveEffectiveTenantId = cache(computeEffectiveTenantId);
