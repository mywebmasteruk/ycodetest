import { unstable_cache } from 'next/cache';
import { fetchHomepage } from '@/lib/page-fetcher';
import { parseHeadHtml } from '@/lib/parse-head-html';

async function fetchPublishedHomepage() {
  try {
    return await unstable_cache(
      async () => fetchHomepage(true),
      ['data-for-route-/'],
      { tags: ['all-pages', 'route-/'], revalidate: false }
    )();
  } catch {
    try {
      return await fetchHomepage(true);
    } catch {
      return null;
    }
  }
}

export default async function HeadHome() {
  const data = await fetchPublishedHomepage();
  const headCode = data?.page?.settings?.custom_code?.head;
  if (!headCode) return null;

  return <>{parseHeadHtml(headCode)}</>;
}
