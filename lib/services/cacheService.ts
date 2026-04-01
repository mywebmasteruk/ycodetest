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

export async function purgeNetlifyEdgeCache(): Promise<{ method: string; ok: boolean; error?: string }> {
  const diagnostics: string[] = [];
  const { token, siteId, siteSlug } = netlifyPurgeCredentials();
  diagnostics.push(
    `env: purge_token=${token ? 'set' : 'missing'}, site_id=${siteId || 'missing'}, site_name=${siteSlug || 'missing'}`,
  );

  if (!token) {
    const msg =
      'no purge token (set NETLIFY_PURGE_API_TOKEN for instant CDN purge; public pages use short s-maxage as fallback)';
    diagnostics.push(msg);
    console.warn(`⚠️ [Cache] ${msg}`);
    return { method: 'none', ok: false, error: diagnostics.join(' | ') };
  }

  const { purgeCache } = await import('@netlify/functions');

  const attempts: Array<{ label: string; run: () => Promise<void> }> = [];

  if (siteId) {
    attempts.push({
      label: 'purgeCache-tags+siteID',
      run: () =>
        purgeCache({
          token,
          siteID: siteId,
          tags: [ALL_PAGES_CACHE_TAG],
        }),
    });
    attempts.push({
      label: 'purgeCache-siteID',
      run: () => purgeCache({ token, siteID: siteId }),
    });
  }

  if (siteSlug) {
    attempts.push({
      label: 'purgeCache-tags+siteSlug',
      run: () =>
        purgeCache({
          token,
          siteSlug,
          tags: [ALL_PAGES_CACHE_TAG],
        }),
    });
    attempts.push({
      label: 'purgeCache-siteSlug',
      run: () => purgeCache({ token, siteSlug }),
    });
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
          cache_tags: [ALL_PAGES_CACHE_TAG],
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
