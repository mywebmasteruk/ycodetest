/**
 * Asset Folder Repository
 *
 * Data access layer for asset folder operations with Supabase
 */

import { getSupabaseAdmin } from '@/lib/supabase-server';
import { SUPABASE_QUERY_LIMIT, SUPABASE_WRITE_BATCH_SIZE } from '@/lib/supabase-constants';
import type { AssetFolder, CreateAssetFolderData, UpdateAssetFolderData } from '../../types';
import { resolveEffectiveTenantId } from '@/lib/masjidweb/effective-tenant-id';
import { applyTenantEq } from '@/lib/masjidweb/apply-tenant-eq';

/**
 * Get all asset folders (drafts by default)
 * @param isPublished - Filter by published status (default: false for drafts)
 */
export async function getAllAssetFolders(isPublished = false): Promise<AssetFolder[]> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  let query = client
    .from('asset_folders')
    .select('*')
    .eq('is_published', isPublished)
    .is('deleted_at', null)
    .order('order', { ascending: true });
  query = applyTenantEq(query, tenantId);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch asset folders: ${error.message}`);
  }

  return data || [];
}

/**
 * Get asset folder by ID (draft by default)
 * @param id - Folder ID
 * @param isPublished - Get published or draft version (default: false for draft)
 */
export async function getAssetFolderById(id: string, isPublished = false): Promise<AssetFolder | null> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  let query = client
    .from('asset_folders')
    .select('*')
    .eq('id', id)
    .eq('is_published', isPublished)
    .is('deleted_at', null);
  query = applyTenantEq(query, tenantId);

  const { data, error } = await query.single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch asset folder: ${error.message}`);
  }

  return data;
}

/**
 * Get all child folders of a parent folder
 * @param parentId - Parent folder ID (null for root folders)
 * @param isPublished - Filter by published status (default: false for drafts)
 */
export async function getChildFolders(
  parentId: string | null,
  isPublished = false
): Promise<AssetFolder[]> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  let query = client
    .from('asset_folders')
    .select('*')
    .eq('is_published', isPublished)
    .is('deleted_at', null);

  // Handle null vs non-null parent_id
  if (parentId === null) {
    query = query.is('asset_folder_id', null);
  } else {
    query = query.eq('asset_folder_id', parentId);
  }

  query = applyTenantEq(query, tenantId);

  const { data, error } = await query.order('order', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch child folders: ${error.message}`);
  }

  return data || [];
}

/**
 * Create new asset folder
 */
export async function createAssetFolder(folderData: CreateAssetFolderData): Promise<AssetFolder> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  // Ensure is_published defaults to false for drafts
  const dataToInsert = {
    ...folderData,
    is_published: folderData.is_published ?? false,
    ...(tenantId ? { tenant_id: tenantId } : {}),
  };

  const { data, error } = await client
    .from('asset_folders')
    .insert(dataToInsert)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create asset folder: ${error.message}`);
  }

  return data;
}

/**
 * Update asset folder (drafts only)
 */
export async function updateAssetFolder(id: string, updates: UpdateAssetFolderData): Promise<AssetFolder> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  let query = client
    .from('asset_folders')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('is_published', false);
  query = applyTenantEq(query, tenantId);

  const { data, error } = await query
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update asset folder: ${error.message}`);
  }

  return data;
}

/**
 * Get all descendant folder IDs recursively (drafts only)
 */
async function getDescendantFolderIds(folderId: string): Promise<string[]> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  // Fetch all non-deleted draft folders once
  let query = client
    .from('asset_folders')
    .select('id, asset_folder_id')
    .eq('is_published', false)
    .is('deleted_at', null);
  query = applyTenantEq(query, tenantId);
  const { data: allFolders, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch folders: ${error.message}`);
  }

  if (!allFolders || allFolders.length === 0) {
    return [];
  }

  // Build a map for quick lookup
  const foldersByParent = new Map<string, string[]>();
  for (const folder of allFolders) {
    const parentId = folder.asset_folder_id || 'root';
    if (!foldersByParent.has(parentId)) {
      foldersByParent.set(parentId, []);
    }
    foldersByParent.get(parentId)!.push(folder.id);
  }

  // Recursively collect all descendant IDs
  const collectDescendants = (parentId: string): string[] => {
    const children = foldersByParent.get(parentId) || [];
    const descendants: string[] = [...children];

    for (const childId of children) {
      descendants.push(...collectDescendants(childId));
    }

    return descendants;
  };

  return collectDescendants(folderId);
}

/**
 * Soft delete an asset folder and all its nested assets and folders (drafts only)
 */
export async function deleteAssetFolder(id: string): Promise<void> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();
  const deletedAt = new Date().toISOString();

  // Get the draft folder before deletion
  const folderToDelete = await getAssetFolderById(id, false);
  if (!folderToDelete) {
    throw new Error('Folder not found');
  }

  // Get all descendant folder IDs
  const descendantFolderIds = await getDescendantFolderIds(id);
  const allFolderIds = [id, ...descendantFolderIds];

  // Soft-delete all draft assets within these folders
  let assetsQuery = client
    .from('assets')
    .update({ deleted_at: new Date().toISOString() })
    .in('asset_folder_id', allFolderIds)
    .eq('is_published', false)
    .is('deleted_at', null);
  assetsQuery = applyTenantEq(assetsQuery, tenantId);
  const { error: assetsError } = await assetsQuery;

  if (assetsError) {
    throw new Error(`Failed to delete assets in folder: ${assetsError.message}`);
  }

  // Soft-delete all draft folders
  let foldersQuery = client
    .from('asset_folders')
    .update({ deleted_at: deletedAt })
    .in('id', allFolderIds)
    .eq('is_published', false)
    .is('deleted_at', null);
  foldersQuery = applyTenantEq(foldersQuery, tenantId);
  const { error: foldersError } = await foldersQuery;

  if (foldersError) {
    throw new Error(`Failed to delete folders: ${foldersError.message}`);
  }
}

/**
 * Reorder folders within a parent (drafts only)
 */
export async function reorderFolders(updates: Array<{ id: string; order: number }>): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const tenantId = await resolveEffectiveTenantId();
  const { getKnexClient } = await import('../knex-client');
  const { batchUpdateColumn } = await import('../knex-helpers');
  const knex = await getKnexClient();

  const extraWhere = tenantId
    ? 'AND is_published = false AND deleted_at IS NULL AND tenant_id = ?'
    : 'AND is_published = false AND deleted_at IS NULL';
  const extraParams = tenantId ? [tenantId] : [];

  await batchUpdateColumn(knex, 'asset_folders', 'order',
    updates.map(u => ({ id: u.id, value: u.order })),
    {
      extraWhereClause: extraWhere,
      extraWhereParams: extraParams,
      castType: 'integer',
    }
  );
}

// =============================================================================
// Publishing Functions
// =============================================================================

/**
 * Get all unpublished (draft) asset folders that have changes.
 * A folder needs publishing if no published version exists or its data differs.
 */
export async function getUnpublishedAssetFolders(): Promise<AssetFolder[]> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  // Fetch all draft folders
  let draftQuery = client
    .from('asset_folders')
    .select('*')
    .eq('is_published', false)
    .is('deleted_at', null)
    .order('depth', { ascending: true })
    .order('order', { ascending: true });
  draftQuery = applyTenantEq(draftQuery, tenantId);
  const { data: draftFolders, error } = await draftQuery;

  if (error) {
    throw new Error(`Failed to fetch draft asset folders: ${error.message}`);
  }

  if (!draftFolders || draftFolders.length === 0) {
    return [];
  }

  // Batch fetch published folders for comparison
  const draftIds = draftFolders.map(f => f.id);
  let pubQuery = client
    .from('asset_folders')
    .select('*')
    .in('id', draftIds)
    .eq('is_published', true);
  pubQuery = applyTenantEq(pubQuery, tenantId);
  const { data: publishedFolders, error: publishedError } = await pubQuery;

  if (publishedError) {
    throw new Error(`Failed to fetch published asset folders: ${publishedError.message}`);
  }

  const publishedById = new Map<string, AssetFolder>();
  publishedFolders?.forEach(f => publishedById.set(f.id, f));

  // Return only folders that are new or have changed
  return draftFolders.filter(draft => {
    const published = publishedById.get(draft.id);
    if (!published) {
      return true; // Never published
    }
    return hasAssetFolderChanged(draft, published);
  });
}

/**
 * Get soft-deleted draft asset folders
 */
export async function getDeletedDraftAssetFolders(): Promise<AssetFolder[]> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  const allFolders: AssetFolder[] = [];
  let offset = 0;

  while (true) {
    let query = client
      .from('asset_folders')
      .select('*')
      .eq('is_published', false)
      .not('deleted_at', 'is', null)
      .range(offset, offset + SUPABASE_QUERY_LIMIT - 1);
    query = applyTenantEq(query, tenantId);
    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch deleted draft asset folders: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    allFolders.push(...data);

    if (data.length < SUPABASE_QUERY_LIMIT) break;
    offset += SUPABASE_QUERY_LIMIT;
  }

  return allFolders;
}

/** Check if a draft asset folder differs from its published version */
function hasAssetFolderChanged(draft: AssetFolder, published: AssetFolder): boolean {
  return (
    draft.name !== published.name ||
    draft.asset_folder_id !== published.asset_folder_id ||
    draft.depth !== published.depth ||
    draft.order !== published.order
  );
}

/**
 * Publish asset folders - copies draft to published, skipping unchanged folders
 */
export async function publishAssetFolders(folderIds: string[]): Promise<{ count: number }> {
  if (folderIds.length === 0) {
    return { count: 0 };
  }

  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  const draftFolders: AssetFolder[] = [];

  // Fetch draft folders in batches
  for (let i = 0; i < folderIds.length; i += SUPABASE_WRITE_BATCH_SIZE) {
    const batchIds = folderIds.slice(i, i + SUPABASE_WRITE_BATCH_SIZE);
    let query = client
      .from('asset_folders')
      .select('*')
      .in('id', batchIds)
      .eq('is_published', false)
      .is('deleted_at', null);
    query = applyTenantEq(query, tenantId);
    const { data, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch draft asset folders: ${fetchError.message}`);
    }

    if (data) {
      draftFolders.push(...data);
    }
  }

  if (draftFolders.length === 0) {
    return { count: 0 };
  }

  // Sort by depth to ensure parents are published before children
  draftFolders.sort((a, b) => a.depth - b.depth);

  // Fetch existing published versions (full data for comparison)
  const publishedById = new Map<string, AssetFolder>();
  for (let i = 0; i < folderIds.length; i += SUPABASE_WRITE_BATCH_SIZE) {
    const batchIds = folderIds.slice(i, i + SUPABASE_WRITE_BATCH_SIZE);
    let query = client
      .from('asset_folders')
      .select('*')
      .in('id', batchIds)
      .eq('is_published', true);
    query = applyTenantEq(query, tenantId);
    const { data: existingPublished } = await query;

    existingPublished?.forEach(f => publishedById.set(f.id, f));
  }

  // Only publish folders that are new or changed
  const recordsToUpsert: any[] = [];
  const now = new Date().toISOString();

  for (const draft of draftFolders) {
    const existing = publishedById.get(draft.id);

    // Skip if published version exists and is identical
    if (existing && !hasAssetFolderChanged(draft, existing)) {
      continue;
    }

    recordsToUpsert.push({
      id: draft.id,
      name: draft.name,
      asset_folder_id: draft.asset_folder_id,
      depth: draft.depth,
      order: draft.order,
      is_published: true,
      created_at: draft.created_at,
      updated_at: now,
      deleted_at: null,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    });
  }

  // Keep sorted by depth to ensure parents are processed first
  recordsToUpsert.sort((a: any, b: any) => a.depth - b.depth);

  if (recordsToUpsert.length > 0) {
    for (let i = 0; i < recordsToUpsert.length; i += SUPABASE_WRITE_BATCH_SIZE) {
      const batch = recordsToUpsert.slice(i, i + SUPABASE_WRITE_BATCH_SIZE);
      const { error: upsertError } = await client
        .from('asset_folders')
        .upsert(batch, {
          onConflict: 'id,is_published',
        });

      if (upsertError) {
        throw new Error(`Failed to publish asset folders: ${upsertError.message}`);
      }
    }
  }

  return { count: recordsToUpsert.length };
}

/**
 * Hard delete asset folders that were soft-deleted in drafts
 */
export async function hardDeleteSoftDeletedAssetFolders(): Promise<{ count: number }> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const tenantId = await resolveEffectiveTenantId();

  // Get all soft-deleted draft folders
  const deletedDrafts = await getDeletedDraftAssetFolders();

  if (deletedDrafts.length === 0) {
    return { count: 0 };
  }

  const ids = deletedDrafts.map(f => f.id);

  // Clear FK references before deleting to avoid composite FK ON DELETE SET NULL
  // nullifying both asset_folder_id AND is_published (violating NOT NULL constraint)
  for (let i = 0; i < ids.length; i += SUPABASE_WRITE_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + SUPABASE_WRITE_BATCH_SIZE);

    // Clear asset_folder_id on assets referencing these folders
    let q1 = client
      .from('assets')
      .update({ asset_folder_id: null })
      .in('asset_folder_id', batchIds)
      .eq('is_published', true);
    q1 = applyTenantEq(q1, tenantId);
    await q1;

    let q2 = client
      .from('assets')
      .update({ asset_folder_id: null })
      .in('asset_folder_id', batchIds)
      .eq('is_published', false);
    q2 = applyTenantEq(q2, tenantId);
    await q2;

    // Clear parent references on child asset_folders
    let q3 = client
      .from('asset_folders')
      .update({ asset_folder_id: null })
      .in('asset_folder_id', batchIds)
      .eq('is_published', true);
    q3 = applyTenantEq(q3, tenantId);
    await q3;

    let q4 = client
      .from('asset_folders')
      .update({ asset_folder_id: null })
      .in('asset_folder_id', batchIds)
      .eq('is_published', false);
    q4 = applyTenantEq(q4, tenantId);
    await q4;
  }

  // Delete published and draft versions in batches
  for (let i = 0; i < ids.length; i += SUPABASE_WRITE_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + SUPABASE_WRITE_BATCH_SIZE);

    // Delete published versions
    let pubDelQ = client
      .from('asset_folders')
      .delete()
      .in('id', batchIds)
      .eq('is_published', true);
    pubDelQ = applyTenantEq(pubDelQ, tenantId);
    const { error: deletePublishedError } = await pubDelQ;

    if (deletePublishedError) {
      console.error('Failed to delete published asset folders:', deletePublishedError);
    }

    // Delete soft-deleted draft versions
    let draftDelQ = client
      .from('asset_folders')
      .delete()
      .in('id', batchIds)
      .eq('is_published', false)
      .not('deleted_at', 'is', null);
    draftDelQ = applyTenantEq(draftDelQ, tenantId);
    const { error: deleteDraftError } = await draftDelQ;

    if (deleteDraftError) {
      throw new Error(`Failed to delete draft asset folders: ${deleteDraftError.message}`);
    }
  }

  return { count: deletedDrafts.length };
}
