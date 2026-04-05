import { revalidateTag, revalidatePath } from 'next/cache';
import { resolveEffectiveTenantId } from '@/lib/masjidweb/effective-tenant-id';
import {
  tenantAllPagesTag,
  tenantRouteTag,
} from '@/lib/masjidweb/tenant-cache-tags';

/**
 * Cache Invalidation Service
 *
 * Netlify: revalidateTag clears Next data cache; optional REST purge clears Edge when configured.
 */

/** Legacy tag when tenant id is unknown (single-tenant / admin scripts). */
const ALL_PAGES_CACHE_TAG = 'all-pages';

function netlifyPurgeCredentials(): {
  token: string | undefined;
  siteId: string | undefined;
  siteSlug: string | undefined;
  } {
  const token =
    process.env.NETLIFY_PURGE_API_TOKEN?.trim() ||
    process.env.NETLIFY_TOKEN?.trim() ||
    process.env.NETLIFY_AUTH_TOKEN?.trim();
  const siteId =
    process.env.NETLIFY_SITE_ID?.trim() ||
    process.env.SITE_ID?.trim();
  const siteSlug = process.env.SITE_NAME?.trim();
  return { token, siteId, siteSlug };
}

/**
 * @param publisherTenantId - When set, purge only that tenant's tagged HTML (see proxy
 *   Netlify-Cache-Tag). Avoids invalidating other tenants on the same Netlify site.
 */
export async function purgeNetlifyEdgeCache(
  publisherTenantId?: string | null,
): Promise<{
  method: string;
  ok: boolean;
  error?: string;
}> {
  const diagnostics: string[] = [];
  const { token, siteId, siteSlug } = netlifyPurgeCredentials();
  const tid = publisherTenantId?.trim() || null;
  const tenantScoped = Boolean(tid);
  const cacheTags = [tid ? tenantAllPagesTag(tid) : ALL_PAGES_CACHE_TAG];
  diagnostics.push(
    `env: purge_token=${token ? 'set' : 'missing'}, site_id=${siteId || 'missing'}, site_name=${siteSlug || 'missing'}, tags=${cacheTags.join(',')}`,
  );

  if (!token) {
    const msg =
      'no purge token (set NETLIFY_PURGE_API_TOKEN for instant CDN purge; public pages use short s-maxage as fallback)';
    diagnostics.push(msg);
    console.warn(`⚠️ [Cache] ${msg}`);
    return { method: 'none', ok: false, error: diagnostics.join(' | ') };
  }

  let purgeCache: (opts: {
    token: string;
    siteID?: string;
    siteSlug?: string;
    tags?: string[];
  }) => Promise<void>;
  try {
    purgeCache = (await import('@netlify/functions')).purgeCache;
  } catch (importErr) {
    const msg = `import @netlify/functions failed: ${importErr instanceof Error ? importErr.message : String(importErr)}`;
    diagnostics.push(msg);
    console.warn(`⚠️ [Cache] ${msg}`);
    return { method: 'none', ok: false, error: diagnostics.join(' | ') };
  }

  const attempts: Array<{ label: string; run: () => Promise<void> }> = [];

  if (siteId) {
    attempts.push({
      label: 'purgeCache-tags+siteID',
      run: () =>
        purgeCache({
          token,
          siteID: siteId,
          tags: cacheTags,
        }),
    });
    // Full-site purge would invalidate every tenant on this Netlify deploy — only for legacy/global.
    if (!tenantScoped) {
      attempts.push({
        label: 'purgeCache-siteID',
        run: () => purgeCache({ token, siteID: siteId }),
      });
    }
  }

  if (siteSlug) {
    attempts.push({
      label: 'purgeCache-tags+siteSlug',
      run: () =>
        purgeCache({
          token,
          siteSlug,
          tags: cacheTags,
        }),
    });
    if (!tenantScoped) {
      attempts.push({
        label: 'purgeCache-siteSlug',
        run: () => purgeCache({ token, siteSlug }),
      });
    }
  }

  for (const { label, run } of attempts) {
    try {
      await run();
      console.log(`✅ [Cache] Netlify edge purged via ${label}`);
      return { method: label, ok: true };
    } catch (err) {
      diagnostics.push(`${label}: ${err}`);
    }
  }

  if (siteId) {
    try {
      const res = await fetch('https://api.netlify.com/api/v1/purge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          site_id: siteId,
          cache_tags: cacheTags,
        }),
      });
      if (res.ok) {
        console.log('✅ [Cache] Netlify edge purged via REST API (cache_tags)');
        return { method: 'rest-api-tags', ok: true };
      }
      const text = await res.text().catch(() => '');
      diagnostics.push(`REST tags: ${res.status} ${text}`);
    } catch (err) {
      diagnostics.push(`REST tags fetch: ${err}`);
    }

    if (!tenantScoped) {
      try {
        const res = await fetch('https://api.netlify.com/api/v1/purge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ site_id: siteId }),
        });
        if (res.ok) {
          console.log('✅ [Cache] Netlify edge purged via REST API (site)');
          return { method: 'rest-api-site', ok: true };
        }
        const text = await res.text().catch(() => '');
        diagnostics.push(`REST site: ${res.status} ${text}`);
      } catch (err) {
        diagnostics.push(`REST site fetch: ${err}`);
      }
    }
  }

  const error = diagnostics.join(' | ');
  console.error('❌ [Cache] All Netlify edge purge methods failed:', error);
  return { method: 'none', ok: false, error };
}

export async function invalidatePage(routePath: string): Promise<boolean> {
  try {
    const effectiveTid = await resolveEffectiveTenantId();
    const normalized = routePath.replace(/^\/+/, '');
    revalidateTag(tenantRouteTag(effectiveTid, normalized || '/'), 'max');
    revalidatePath(normalized ? `/${normalized}` : '/', 'page');
    return true;
  } catch (error) {
    console.error('❌ [Cache] Invalidation error:', error);
    return false;
  }
}

export async function invalidatePages(routePaths: string[]): Promise<boolean> {
  const results = await Promise.all(
    routePaths.map((routePath) => invalidatePage(routePath)),
  );
  return results.every(Boolean);
}

export async function clearAllCache(
  publisherTenantId?: string | null,
): Promise<Record<string, unknown>> {
  const tid = publisherTenantId?.trim() || null;
  let nextCacheNote: string | undefined;
  try {
    // Next.js 16 expects a profile string (e.g. "max"); invalid profile or missing
    // incrementalCache on some hosts must not fail the whole publish pipeline.
    revalidateTag(tenantAllPagesTag(tid), 'max');
    revalidateTag(tenantRouteTag(tid, '/'), 'max');
    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
  } catch (error) {
    nextCacheNote =
      error instanceof Error ? error.message : String(error);
    console.warn('⚠️ [Cache] Next revalidate skipped (non-fatal):', nextCacheNote);
  }

  const purge = await purgeNetlifyEdgeCache(tid);
  return {
    ...purge,
    publisherTenantId: tid,
    ...(nextCacheNote ? { nextJsRevalidateNote: nextCacheNote } : {}),
  };
}
