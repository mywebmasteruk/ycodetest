import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveInviteRedirectUrl } from './auth-invite-redirect';

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

describe('resolveInviteRedirectUrl', () => {
  it('uses explicit https redirect from body', () => {
    const r = req('https://masjidemo1.masjidweb.com/ycode/api/auth/invite');
    expect(
      resolveInviteRedirectUrl(
        r,
        'https://masjidemo1.masjidweb.com/ycode/accept-invite',
      ),
    ).toBe('https://masjidemo1.masjidweb.com/ycode/accept-invite');
  });

  it('derives redirect from Host when body omit', () => {
    const r = req('https://example.com/ycode/api/auth/invite', {
      host: 'masjidemo1.masjidweb.com',
      'x-forwarded-proto': 'https',
    });
    expect(resolveInviteRedirectUrl(r, undefined)).toBe(
      'https://masjidemo1.masjidweb.com/ycode/accept-invite',
    );
  });

  it('prefers x-forwarded-host first label', () => {
    const r = req('https://internal/ycode/api/auth/invite', {
      host: 'internal',
      'x-forwarded-host': 'manage.masjidweb.com',
      'x-forwarded-proto': 'https',
    });
    expect(resolveInviteRedirectUrl(r, '')).toBe(
      'https://manage.masjidweb.com/ycode/accept-invite',
    );
  });
});
