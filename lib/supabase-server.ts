import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { headers, cookies } from 'next/headers';
import { credentials } from './credentials';
import { parseSupabaseConfig } from './supabase-config-parser';
import { supabaseCookieOptionsForHost } from './supabase-cookie-domain';
import type { SupabaseConfig, SupabaseCredentials } from '@/types';

/**
 * Supabase Server Client
 *
 * Creates authenticated Supabase clients for server-side operations
 * Credentials are fetched from file-based storage or environment variables
 */

/**
 * Get Supabase credentials from storage
 * Parses the stored config to extract all necessary details
 */
async function getSupabaseCredentials(): Promise<SupabaseCredentials | null> {
  const config = await credentials.get<SupabaseConfig>('supabase_config');

  if (!config) {
    return null;
  }

  try {
    return parseSupabaseConfig(config);
  } catch (error) {
    console.error('[getSupabaseCredentials] Failed to parse config:', error);
    return null;
  }
}

/**
 * Get Supabase configuration (exported for use in knex-client)
 * Alias for getSupabaseCredentials
 */
export const getSupabaseConfig = getSupabaseCredentials;

let cachedServiceClient: SupabaseClient | null = null;
let cachedServiceCredentials: string | null = null;

/**
 * Build a per-request Supabase client that carries the user's session.
 * PostgREST sees this as the `authenticated` role so RLS policies apply.
 */
async function getAuthenticatedClient(): Promise<SupabaseClient | null> {
  const creds = await getSupabaseCredentials();
  if (!creds) return null;

  const cookieStore = await cookies();
  const host = (await headers()).get('host') || '';
  const cookieOpts = supabaseCookieOptionsForHost(
    host,
    process.env.TENANT_DOMAIN_SUFFIX || process.env.NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX,
  );

  return createServerClient(creds.projectUrl, creds.anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try { cookieStore.set(name, value, options); } catch { /* read-only context */ }
        });
      },
    },
    ...(cookieOpts ? { cookieOptions: cookieOpts } : {}),
  });
}

/**
 * Get Supabase client for data access.
 *
 * When a user has a Supabase session (editor logged in), returns the anon-key
 * server client with cookies so PostgREST uses `authenticated` and RLS applies
 * (JWT includes user_metadata.tenant_id).
 *
 * Do not rely on `x-tenant-id` alone: middleware-set headers are not always
 * visible to Route Handlers in Next.js; that previously forced service role and
 * bypassed RLS.
 *
 * Service role is used only when there is no session (setup wizard, migrations).
 */
export async function getSupabaseAdmin(tenantId?: string): Promise<SupabaseClient | null> {
  let authClient: SupabaseClient | null = null;
  try {
    authClient = await getAuthenticatedClient();
  } catch {
    // cookies()/headers() throw inside unstable_cache or other non-request contexts
  }
  if (authClient) {
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (user) {
      return authClient;
    }
  }

  const creds = await getSupabaseCredentials();

  if (!creds) {
    console.error('[getSupabaseAdmin] No credentials returned!');
    return null;
  }

  const credKey = `${creds.projectUrl}:${creds.serviceRoleKey}`;
  if (cachedServiceClient && cachedServiceCredentials === credKey) {
    return cachedServiceClient;
  }

  cachedServiceClient = createClient(creds.projectUrl, creds.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  cachedServiceCredentials = credKey;

  return cachedServiceClient;
}

/**
 * Get Supabase client with service role key (always bypasses RLS).
 * Use only for operations that genuinely need admin access (publishing, setup, migrations).
 */
export async function getSupabaseServiceRole(): Promise<SupabaseClient | null> {
  const creds = await getSupabaseCredentials();
  if (!creds) return null;

  const credKey = `${creds.projectUrl}:${creds.serviceRoleKey}`;
  if (cachedServiceClient && cachedServiceCredentials === credKey) {
    return cachedServiceClient;
  }

  cachedServiceClient = createClient(creds.projectUrl, creds.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  cachedServiceCredentials = credKey;

  return cachedServiceClient;
}

/**
 * Test Supabase connection with full config
 */
export async function testSupabaseConnection(
  config: SupabaseConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = parseSupabaseConfig(config);

    const client = createClient(parsed.projectUrl, parsed.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Test connection by trying to list users (requires service role key)
    // This verifies both connection and authentication
    const { error } = await client.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

async function getTenantIdFromSession(): Promise<string | null> {
  const client = await getAuthenticatedClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  const tid = user?.user_metadata?.tenant_id;
  return typeof tid === 'string' && tid.length > 0 ? tid : null;
}

/**
 * Tenant id for Knex filters: middleware `x-tenant-id` when present, else
 * `user_metadata.tenant_id` from the Supabase session (same source as RLS JWT).
 */
export async function getTenantIdFromHeaders(): Promise<string | null> {
  try {
    const h = await headers();
    const fromHeader = h.get('x-tenant-id');
    if (fromHeader) return fromHeader;
  } catch {
    // ignore
  }
  try {
    const fromSession = await getTenantIdFromSession();
    if (fromSession) return fromSession;
  } catch {
    // ignore
  }
  const fromEnv = process.env.TENANT_ID?.trim();
  return fromEnv || null;
}

/**
 * Tenant row scope for SSR: explicit arg, middleware `x-tenant-id`, then env fallbacks
 * (single-tenant / template builds without a subdomain).
 */
export async function resolveTenantScope(explicitTenantId?: string | null): Promise<string | null> {
  if (explicitTenantId) return explicitTenantId;
  const fromHeader = await getTenantIdFromHeaders();
  if (fromHeader) return fromHeader;
  const fromEnv =
    process.env.TENANT_ID?.trim() ||
    process.env.NEXT_PUBLIC_TENANT_ID?.trim() ||
    process.env.TEMPLATE_TENANT_ID?.trim();
  return fromEnv || null;
}

/**
 * Defense-in-depth: when tenant context exists, narrow PostgREST queries to `tenant_id`.
 * Use on tables that have a `tenant_id` column so listings stay correct even if the
 * client falls back to the service role (RLS bypass).
 *
 * No-op in single-tenant / pre-login contexts where no tenant id is available.
 *
 * Typed as `any` so Supabase PostgrestFilterBuilder chains keep inferring correctly.
 */

export function scopeToTenantRow(query: any, tenantId: string | null): any {
  if (!tenantId) return query;
  return query.eq('tenant_id', tenantId);
}

/**
 * Execute raw SQL query
 */
export async function executeSql(sql: string): Promise<{ success: boolean; error?: string }> {
  const client = await getSupabaseServiceRole();

  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await client.rpc('exec_sql', { sql });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SQL execution failed',
    };
  }
}
