import { getCollectionById } from '@/lib/repositories/collectionRepository';

export { applyTenantEq } from '@/lib/masjidweb/apply-tenant-eq';

/**
 * Fork-owned query helpers for multi-tenant Supabase filters.
 * Keeps repository files closer to upstream by centralizing repeated patterns.
 */

/** True if the current tenant can see this collection (draft or published row, including soft-deleted). */
export async function tenantHasCollectionAccess(collectionId: string): Promise<boolean> {
  if (await getCollectionById(collectionId, false, true)) return true;
  if (await getCollectionById(collectionId, true, true)) return true;
  return false;
}
