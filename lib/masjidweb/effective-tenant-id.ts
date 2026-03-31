import { headers } from 'next/headers';
import { settingsTenantIdOrNull } from '@/lib/masjidweb/settings-tenant-id';

/**
 * Single entry point for “which tenant applies to this server work?”
 *
 * 1. `x-tenant-id` from the proxy (subdomain / JWT / provisioning), when a request exists
 * 2. Env fallback: `TENANT_ID`, then `MASTER_TENANT_ID`, then `TEMPLATE_TENANT_ID`
 *
 * Repositories should use this (not env alone) so one deploy serving many subdomains
 * stays aligned with Knex helpers. If `headers()` is unavailable (e.g. scripts), we
 * fall back to env only — same as pre-change settings behavior.
 */
export async function resolveEffectiveTenantId(): Promise<string | null> {
  try {
    const h = await headers();
    const fromHeader = h.get('x-tenant-id')?.trim();
    if (fromHeader) return fromHeader;
  } catch {
    /* no request AsyncLocalStorage context */
  }
  return settingsTenantIdOrNull();
}
