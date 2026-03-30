/**
 * Optional shared cookie domain so Supabase auth works across tenant subdomains
 * and the apex host (e.g. session from invite landing on https://masjidweb.com/...
 * is still sent to https://tenant.masjidweb.com).
 *
 * Set NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX (browser) and TENANT_DOMAIN_SUFFIX (server)
 * to your tenant base domain, e.g. masjidweb.com
 */
export function supabaseCookieOptionsForHost(
  hostname: string,
  tenantDomainSuffix: string | undefined,
): { domain: string } | undefined {
  const suffix = (tenantDomainSuffix || '').trim().toLowerCase();
  if (!suffix) return undefined;

  const h = hostname.replace(/:\d+$/, '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost')) return undefined;

  if (h === suffix || h.endsWith(`.${suffix}`)) {
    return { domain: `.${suffix}` };
  }

  return undefined;
}
