import { describe, expect, it } from 'vitest';
import { tenantAllPagesTag, tenantRouteTag } from './tenant-cache-tags';

describe('tenantAllPagesTag', () => {
  it('returns global tag when tenant id is null', () => {
    expect(tenantAllPagesTag(null)).toBe('all-pages');
  });

  it('returns global tag when tenant id is undefined', () => {
    expect(tenantAllPagesTag(undefined)).toBe('all-pages');
  });

  it('returns global tag when tenant id is empty string', () => {
    expect(tenantAllPagesTag('')).toBe('all-pages');
    expect(tenantAllPagesTag('  ')).toBe('all-pages');
  });

  it('returns tenant-scoped tag for a valid UUID', () => {
    const tid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(tenantAllPagesTag(tid)).toBe(`tenant-${tid}-all-pages`);
  });

  it('trims whitespace from tenant id', () => {
    const tid = '  aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee  ';
    expect(tenantAllPagesTag(tid)).toBe('tenant-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-all-pages');
  });

  it('tenant A tag differs from tenant B tag', () => {
    const tagA = tenantAllPagesTag('tenant-a-id');
    const tagB = tenantAllPagesTag('tenant-b-id');
    expect(tagA).not.toBe(tagB);
  });
});

describe('tenantRouteTag', () => {
  it('returns global route tag when no tenant id', () => {
    expect(tenantRouteTag(null, '/')).toBe('route-/');
    expect(tenantRouteTag(null, 'about')).toBe('route-/about');
  });

  it('returns tenant-scoped route tag', () => {
    const tid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(tenantRouteTag(tid, '/')).toBe(`tenant-${tid}-route-/`);
    expect(tenantRouteTag(tid, 'about')).toBe(`tenant-${tid}-route-/about`);
  });

  it('strips leading slashes from path', () => {
    const tid = 'abc';
    expect(tenantRouteTag(tid, '///blog')).toBe('tenant-abc-route-/blog');
  });

  it('different tenants produce different route tags for the same path', () => {
    expect(tenantRouteTag('a', 'about')).not.toBe(tenantRouteTag('b', 'about'));
  });
});
