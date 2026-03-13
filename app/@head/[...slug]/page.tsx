import { unstable_cache } from 'next/cache';
import { fetchPageByPath } from '@/lib/page-fetcher';
import { parseHeadHtml } from '@/lib/parse-head-html';
import { resolveCustomCodePlaceholders } from '@/lib/resolve-cms-variables';

const NON_PAGE_PREFIXES = ['ycode', 'dynamic', '_next', 'api'];

/**
 * Reuse the same static params as the main [...slug] route.
 * Imported dynamically to avoid duplicating the logic.
 */
export { generateStaticParams } from '@/app/[...slug]/page';

async function fetchPublishedPageWithLayers(slugPath: string) {
  try {
    return await unstable_cache(
      async () => fetchPageByPath(slugPath, true),
      [`data-for-route-/${slugPath}`],
      { tags: ['all-pages', `route-/${slugPath}`], revalidate: false }
    )();
  } catch {
    try {
      return await fetchPageByPath(slugPath, true);
    } catch {
      return null;
    }
  }
}

interface HeadSlugProps {
  params: Promise<{ slug: string | string[] }>;
}

export default async function HeadSlug({ params }: HeadSlugProps) {
  const { slug } = await params;
  const slugPath = Array.isArray(slug) ? slug.join('/') : slug;

  if (NON_PAGE_PREFIXES.some(prefix => slugPath.startsWith(prefix))) {
    return null;
  }

  const data = await fetchPublishedPageWithLayers(slugPath);
  if (!data) return null;

  const headCode = data.page?.settings?.custom_code?.head;
  if (!headCode) return null;

  const resolved = data.page.is_dynamic && data.collectionItem
    ? resolveCustomCodePlaceholders(headCode, data.collectionItem, data.collectionFields || [])
    : headCode;

  if (!resolved) return null;
  return <>{parseHeadHtml(resolved)}</>;
}
