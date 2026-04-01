import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const purgeCacheMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@netlify/functions', () => ({
  purgeCache: (...args: unknown[]) => purgeCacheMock(...args),
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { purgeNetlifyEdgeCache } from './cacheService';

describe('purgeNetlifyEdgeCache', () => {
  const envKeys = [
    'NETLIFY_PURGE_API_TOKEN',
    'NETLIFY_TOKEN',
    'NETLIFY_AUTH_TOKEN',
    'NETLIFY_SITE_ID',
    'SITE_ID',
    'SITE_NAME',
  ] as const;

  beforeEach(() => {
    purgeCacheMock.mockClear();
    for (const k of envKeys) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of envKeys) {
      delete process.env[k];
    }
  });

  it('returns ok:false when no purge token is set', async () => {
    process.env.SITE_ID = 'abc-123';
    const r = await purgeNetlifyEdgeCache();
    expect(r.ok).toBe(false);
    expect(purgeCacheMock).not.toHaveBeenCalled();
  });

  it('prefers tag purge with SITE_ID and token', async () => {
    process.env.NETLIFY_PURGE_API_TOKEN = 'test-token';
    process.env.SITE_ID = '11111111-2222-3333-4444-555555555555';
    const r = await purgeNetlifyEdgeCache();
    expect(r.ok).toBe(true);
    expect(r.method).toBe('purgeCache-tags+siteID');
    expect(purgeCacheMock).toHaveBeenCalledWith({
      token: 'test-token',
      siteID: '11111111-2222-3333-4444-555555555555',
      tags: ['all-pages'],
    });
  });

  it('falls back to siteSlug when SITE_ID is missing', async () => {
    process.env.NETLIFY_PURGE_API_TOKEN = 'test-token';
    process.env.SITE_NAME = 'my-site-slug';
    const r = await purgeNetlifyEdgeCache();
    expect(r.ok).toBe(true);
    expect(r.method).toBe('purgeCache-tags+siteSlug');
    expect(purgeCacheMock).toHaveBeenCalledWith({
      token: 'test-token',
      siteSlug: 'my-site-slug',
      tags: ['all-pages'],
    });
  });
});
