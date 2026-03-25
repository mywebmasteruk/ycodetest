import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { headers, cookies } from 'next/headers';
import { credentials } from './credentials';
import { parseSupabaseConfig } from './supabase-config-parser';
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
  return createServerClient(creds.projectUrl, creds.anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try { cookieStore.set(name, value, options); } catch { /* read-only context */ }
        });
      },
    },
  });
}

/**
 * Get Supabase client for data access.
 *
 * When a tenant context is active (x-tenant-id header set by middleware),
 * returns an authenticated client so RLS filters rows by tenant_id.
 * Otherwise returns the service-role client for admin / setup operations.
 */
export async function getSupabaseAdmin(tenantId?: string): Promise<SupabaseClient | null> {
  const headerTenantId = await getTenantIdFromHeaders();

  if (headerTenantId) {
    const authClient = await getAuthenticatedClient();
    if (authClient) return authClient;
  }

  // Fallback: service-role client (setup wizard, admin, no tenant context)
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

/**
 * Get tenant ID from request headers set by the multi-tenant middleware.
 * Returns null when no subdomain is active (admin / master site).
 */
export async function getTenantIdFromHeaders(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get('x-tenant-id') || null;
  } catch {
    return null;
  }
}

/**
 * Execute raw SQL query
 */
export async function executeSql(sql: string): Promise<{ success: boolean; error?: string }> {
  const client = await getSupabaseAdmin();

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
