import { revalidateTag, revalidatePath } from 'next/cache';

/**
 * Cache Invalidation Service
 *
 * Architecture (Netlify):
 *   1. Next.js Data Cache (Netlify Blobs) — cleared by revalidateTag
 *   2. Next.js Full Route Cache (Netlify Durable) — cleared by revalidatePath
 *   3. Netlify Edge CDN — purged via Netlify purge API + @netlify/functions purgeCache.
 *      revalidatePath alone does NOT propagate to the Edge CDN on Netlify.
 */

function netlifyPurgeCredentials(): { token: string | undefined; siteId: string | undefined } {
  const token =
    process.env.NETLIFY_PURGE_API_TOKEN?.trim() ||
    process.env.NETLIFY_TOKEN?.trim() ||
    process.env.NETLIFY_AUTH_TOKEN?.trim();
  const siteId =
    process.env.NETLIFY_SITE_ID?.trim() ||
    process.env.SITE_ID?.trim();
  return { token, siteId };
}

export async function purgeNetlifyEdgeCache(): Promise<{ method: string; ok: boolean; error?: string }> {
  const diagnostics: string[] = [];
  const { token, siteId } = netlifyPurgeCredentials();
  diagnostics.push(
    `env: purge_token=${token ? 'set' : 'missing'}, site_id=${siteId || 'missing'}`,
  );

  // purgeCache() without options throws unless NETLIFY_PURGE_API_TOKEN exists — pass token explicitly.
  if (token && siteId) {
    try {
      const { purgeCache } = await import('@netlify/functions');
      await purgeCache({ token, siteID: siteId });
      console.log('✅ [Cache] Netlify edge purged via purgeCache({ token, siteID })');
      return { method: 'purgeCache', ok: true };
    } catch (err) {
      diagnostics.push(`purgeCache: ${err}`);
    }
  }

  if (token && siteId) {
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
        console.log('✅ [Cache] Netlify edge purged via REST API');
        return { method: 'rest-api', ok: true };
      }
      const text = await res.text().catch(() => '');
      diagnostics.push(`REST API: ${res.status} ${text}`);
    } catch (err) {
      diagnostics.push(`REST API fetch: ${err}`);
    }
  }

  const error = diagnostics.join(' | ');
  console.error('❌ [Cache] All Netlify edge purge methods failed:', error);
  return { method: 'none', ok: false, error };
}

/**
 * Invalidate cache for a specific page by route path
 *
 * @param routePath - Route path
 */
export async function invalidatePage(routePath: string): Promise<boolean> {
  try {
    revalidateTag(`route-/${routePath}`, { expire: 0 });
    revalidatePath(`/${routePath}`, 'page');
    return true;
  } catch (error) {
    console.error('❌ [Cache] Invalidation error:', error);
    return false;
  }
}

/**
 * Invalidate cache for multiple pages
 *
 * @param routePaths - Array of route paths
 */
export async function invalidatePages(routePaths: string[]): Promise<boolean> {
  const results = await Promise.all(
    routePaths.map((routePath) => invalidatePage(routePath))
  );

  return results.every((result) => result);
}

/**
 * Clear all cache after publish.
 * @param publisherTenantId - optional; included in return payload for debugging (subdomain tenant).
 * Returns diagnostic info about the Netlify edge purge for debugging.
 */
export async function clearAllCache(
  publisherTenantId?: string | null,
): Promise<Record<string, unknown>> {
  try {
    revalidateTag('all-pages', { expire: 0 });
    revalidateTag('route-/', { expire: 0 });
    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
  } catch (error) {
    console.error('❌ [Cache] Clear all error:', error);
    throw new Error('Failed to clear all cache');
  }

  const purge = await purgeNetlifyEdgeCache();
  return {
    ...purge,
    publisherTenantId: publisherTenantId ?? null,
  };
}
