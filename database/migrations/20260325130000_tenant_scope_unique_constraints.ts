import type { Knex } from 'knex';

/**
 * Scope name/code/key uniqueness per tenant for multi-tenant isolation.
 * Without this, cloning a template for a second tenant fails on duplicate
 * style names, locale codes, and setting keys.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(
    'ALTER TABLE layer_styles DROP CONSTRAINT IF EXISTS layer_styles_name_is_published_unique',
  );
  await knex.schema.raw(
    'DROP INDEX IF EXISTS public.layer_styles_name_tenant_is_published_unique',
  );
  await knex.schema.raw(`
    CREATE UNIQUE INDEX layer_styles_name_tenant_is_published_unique
    ON layer_styles (tenant_id, name, is_published)
  `);

  await knex.schema.raw(
    'ALTER TABLE locales DROP CONSTRAINT IF EXISTS locales_code_is_published_unique',
  );
  await knex.schema.raw(
    'DROP INDEX IF EXISTS public.locales_code_tenant_is_published_unique',
  );
  await knex.schema.raw(`
    CREATE UNIQUE INDEX locales_code_tenant_is_published_unique
    ON locales (tenant_id, code, is_published)
  `);

  await knex.schema.raw(
    'ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_unique',
  );
  await knex.schema.raw('DROP INDEX IF EXISTS public.settings_key_tenant_unique');
  await knex.schema.raw(`
    CREATE UNIQUE INDEX settings_key_tenant_unique
    ON settings (tenant_id, key)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS layer_styles_name_tenant_is_published_unique');
  await knex.schema.raw(`
    CREATE UNIQUE INDEX layer_styles_name_is_published_unique
    ON layer_styles (name, is_published)
  `);

  await knex.schema.raw('DROP INDEX IF EXISTS locales_code_tenant_is_published_unique');
  await knex.schema.raw(`
    CREATE UNIQUE INDEX locales_code_is_published_unique
    ON locales (code, is_published)
  `);

  await knex.schema.raw('DROP INDEX IF EXISTS settings_key_tenant_unique');
  await knex.schema.raw(`
    CREATE UNIQUE INDEX settings_key_unique
    ON settings (key)
  `);
}
