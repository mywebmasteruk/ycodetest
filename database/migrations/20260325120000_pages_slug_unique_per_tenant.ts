import type { Knex } from 'knex';

/**
 * Slug uniqueness must be scoped per tenant. The previous index allowed only one
 * (slug, folder, published) combination globally, blocking template clone for new tenants.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(
    'DROP INDEX IF EXISTS public.pages_slug_is_published_folder_unique',
  );
  // Idempotent: index may already exist if migration was applied via dashboard/SQL earlier.
  await knex.schema.raw(
    'DROP INDEX IF EXISTS public.pages_slug_is_published_folder_tenant_unique',
  );
  await knex.schema.raw(`
    CREATE UNIQUE INDEX pages_slug_is_published_folder_tenant_unique
    ON public.pages (
      tenant_id,
      slug,
      is_published,
      COALESCE(page_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(error_page, 0)
    )
    WHERE deleted_at IS NULL AND is_dynamic = false
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(
    'DROP INDEX IF EXISTS public.pages_slug_is_published_folder_tenant_unique',
  );
  await knex.schema.raw(`
    CREATE UNIQUE INDEX pages_slug_is_published_folder_unique
    ON public.pages (
      slug,
      is_published,
      COALESCE(page_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(error_page, 0)
    )
    WHERE deleted_at IS NULL AND is_dynamic = false
  `);
}
