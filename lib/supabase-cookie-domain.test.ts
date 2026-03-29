import { describe, expect, it } from 'vitest';
import { supabaseCookieOptionsForHost } from './supabase-cookie-domain';

describe('supabaseCookieOptionsForHost', () => {
  it('returns undefined without suffix', () => {
    expect(supabaseCookieOptionsForHost('foo.example.com', undefined)).toBeUndefined();
    expect(supabaseCookieOptionsForHost('foo.example.com', '')).toBeUndefined();
  });

  it('sets shared domain for apex host', () => {
    expect(supabaseCookieOptionsForHost('masjidweb.com', 'masjidweb.com')).toEqual({
      domain: '.masjidweb.com',
    });
  });

  it('sets shared domain for tenant subdomain', () => {
    expect(supabaseCookieOptionsForHost('tenant.masjidweb.com', 'masjidweb.com')).toEqual({
      domain: '.masjidweb.com',
    });
  });

  it('ignores localhost', () => {
    expect(supabaseCookieOptionsForHost('localhost', 'masjidweb.com')).toBeUndefined();
    expect(supabaseCookieOptionsForHost('tenant.localhost', 'localhost')).toBeUndefined();
  });

  it('strips port from hostname', () => {
    expect(supabaseCookieOptionsForHost('tenant.masjidweb.com:3002', 'masjidweb.com')).toEqual({
      domain: '.masjidweb.com',
    });
  });
});
