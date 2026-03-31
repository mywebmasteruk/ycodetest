import { describe, expect, it, vi } from 'vitest';
import { applyTenantEq } from '@/lib/masjidweb/apply-tenant-eq';

type ChainedEq = { eq: (c: string, v: string) => ChainedEq };

describe('applyTenantEq', () => {
  it('chains eq when tenantId set', () => {
    const q: ChainedEq = {
      eq: vi.fn((c: string, v: string) => q),
    };
    const out = applyTenantEq(q, 'tid');
    expect(q.eq).toHaveBeenCalledWith('tenant_id', 'tid');
    expect(out).toBe(q);
  });

  it('returns same object when tenantId null', () => {
    const q: ChainedEq = {
      eq: vi.fn((c: string, v: string) => q),
    };
    const out = applyTenantEq(q, null);
    expect(q.eq).not.toHaveBeenCalled();
    expect(out).toBe(q);
  });
});
