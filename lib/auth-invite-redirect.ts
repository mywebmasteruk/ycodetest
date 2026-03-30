import type { NextRequest } from 'next/server';

const ACCEPT_INVITE_PATH = '/ycode/accept-invite';

/**
 * Supabase invite emails use `redirect_to` on the verify link. If it is missing,
 * GoTrue falls back to the project **Site URL** (e.g. https://masjidweb.com).
 * We derive a per-tenant URL from the incoming request host so invites sent
 * from masjidemo1.* (or manage.*) return users to that same subdomain.
 */
export function resolveInviteRedirectUrl(
  request: NextRequest,
  bodyRedirectTo: unknown,
): string | undefined {
  const raw =
    typeof bodyRedirectTo === 'string' && bodyRedirectTo.trim().length > 0
      ? bodyRedirectTo.trim()
      : '';

  if (raw.startsWith('https://') || raw.startsWith('http://')) {
    return raw;
  }

  const forwarded = request.headers.get('x-forwarded-host');
  const host = (
    forwarded?.split(',')[0]?.trim() ||
    request.headers.get('host')?.replace(/:\d+$/, '') ||
    ''
  ).toLowerCase();

  if (!host) {
    return undefined;
  }

  const protoHeader = request.headers.get('x-forwarded-proto');
  const proto =
    protoHeader?.split(',')[0]?.trim() ||
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');

  return `${proto}://${host}${ACCEPT_INVITE_PATH}`;
}
