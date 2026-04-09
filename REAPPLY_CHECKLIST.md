# Multi-tenant / MasjidWeb customisations — reapply checklist

> **Note:** Production is **`main`** only. The following describes a historical reset branch used for bisecting; keep using **`main`** for all new work.

The former long-lived secondary branch was reset toward **vanilla YCode** (`upstream/main`) for the builder, data layer, Supabase server, and routing. The items below were **removed or reverted** and can be reintroduced **one at a time** to find what breaks publish or the editor.

## Critical warning (read first)

- **Database** still has **multi-tenant schema** (e.g. `tenant_id`, per-tenant unique indexes) from migrations that were **kept**:
  - `database/migrations/20260325120000_pages_slug_unique_per_tenant.ts`
  - `database/migrations/20260325130000_tenant_scope_unique_constraints.ts`
- **Code** uses the **service role** via `getSupabaseAdmin()`; **app-layer** `tenant_id` filters are **complete** across all repositories, services, and rendering paths (RLS is not assumed). Scoped: `settingsRepository`, `pageRepository`, `pageLayersRepository`, `pageFolderRepository`, `collectionRepository`, `collectionFieldRepository`, `collectionItemValueRepository`, `collectionItemRepository`, `collectionImportRepository`, `componentRepository`, `layerStyleRepository`, `localeRepository`, `fontRepository`, `assetRepository`, `assetFolderRepository`, `collectionService` (publish/cleanup), `page-fetcher` (public site), `translationRepository`, `colorVariableRepository`, `fetchFoldersForAuth` (page-auth), `generateStaticParams`, `unstable_cache` keys (all include tenant), and `v1 API POST` (published inserts). System CMS fields (`tenant_id`, `tenant_slug`) are filtered from builder UI.
- On a **shared Supabase** with multiple tenants, data isolation relies on **app-layer** `tenant_id` filters (service role bypasses RLS). The scoping is now comprehensive but review edge cases if new direct queries are added.

## What was kept (not reverted)

| Area | Purpose |
|------|---------|
| `netlify.toml` | Netlify Next plugin / build |
| `.github/workflows/deploy-to-netlify.yml` (and other fork workflows) | CI / deploy wiring |
| `database/migrations/20260325*.ts` | Already applied DB constraints (do not drop from repo casually) |
| `svg-modules.d.ts` | Local TS fix for SVG imports |

## Fork-only `next.config.ts` you may want back early

The reset aligned `next.config.ts` with **upstream**, which **drops** the extra `headers()` entry that forced **`/`** to `Cache-Control: private, no-cache, no-store, ...`. If the **public homepage** looks stale on Netlify while you bisect, restore **only that block** from pre-reset `tenant-multi` (or reapply after confirming publish works).

## What was restored from `upstream/main`

Roughly the Git diff between `upstream/main` and pre-reset `tenant-multi` (excluding the rows above):

- **Routing:** root **`proxy.ts`** sets `x-tenant-id` from subdomain / `tenant_registry`, strips client tenant headers, enforces auth on `/ycode/api`, and **403** when JWT `user_metadata.tenant_id` disagrees with `x-tenant-id`.
- **`lib/supabase-server.ts`:** service-role client only (no session + tenant header layering).
- **`lib/supabase-browser.ts`:** upstream version (no shared cookie-domain helper).
- **Repositories:** CMS `collection*` repos now use `resolveEffectiveTenantId()` where the schema has `tenant_id`; **`collectionService`**, **`components`**, `layer_styles`, `locales`, `fonts`, `assets`, `asset_folders`, and other tables may still need the same pattern if they touch shared Supabase from the builder.
- **`lib/page-fetcher.ts`:** upstream (public site fetch path).
- **Auth routes:** `app/ycode/api/auth/callback`, `invite`; **`app/ycode/accept-invite`**, **`stores/useAuthStore.ts`**.
- **Other:** `app/page.tsx`, `components/MigrationChecker.tsx`, `app/ycode/api/collections/[id]/items/route.ts`, `lib/templates/blocks.ts`, `lib/version-utils.ts`, `next.config.ts`, `.env.example`, `.gitignore`.

## What was deleted (fork-only; reapply if needed)

| Path | Role |
|------|------|
| `middleware.ts` | Subdomain → `tenant_registry`, `x-tenant-id`, auth for `/ycode/api` |
| `lib/tenant/middleware-utils.ts` (+ tests, `index.ts`) | `extractSubdomain`, public route helpers, etc. |
| `lib/supabase-cookie-domain.ts` (+ tests) | Cookie options for `*.masjidweb.com` |
| `lib/auth-invite-redirect.ts` (+ tests) | Post-invite redirect URLs for multi-host setup |

## Suggested order to reapply (bisect)

Do **one step**, then **deploy / test publish** and note when it breaks.

1. **`lib/supabase-cookie-domain.ts` + tests**  
   Restore from git history (`git show tenant-multi:lib/supabase-cookie-domain.ts`). Wire **only** into `lib/supabase-browser.ts` and auth callback if cookies break across subdomains.

2. **`lib/auth-invite-redirect.ts` + tests**  
   Restore; wire `app/ycode/api/auth/invite/route.ts` again.

3. **`lib/tenant/middleware-utils.ts` (+ `index.ts`, tests)**  
   Pure helpers; no behaviour change until middleware uses them.

4. **`middleware.ts`** (last — largest behavioural change)  
   Restore from `tenant-multi` before reset: subdomain lookup, `x-tenant-id`, protected API auth.  
   **Note:** Next 16 deprecates `middleware` in favour of `proxy.ts`; you may need to merge auth + tenant logic into **`proxy.ts`** per Next guidance, or keep middleware until you migrate.

5. **Repository tenant scoping** (can split by table)  
   Reintroduce `getTenantIdFromHeaders` + `scopeToTenantRow` in:
   - `lib/repositories/settingsRepository.ts` (fixes duplicate `published_at` / keys)
   - then `pageRepository`, `pageLayersRepository`, `collection*`, etc.

6. **`lib/supabase-server.ts` fork version**  
   Session-aware client + tenant header fallbacks (merge hotspot vs upstream).

7. **`lib/page-fetcher.ts` fork version**  
   Public site + collection resolution + any `TENANT_ID` / CMS field filtering.

8. **Auth / invite / accept-invite** fork deltas  
   If invite flows still wrong after 1–6.

## Git reference

To see pre-reset versions:

```bash
git log -1 --before='2026-03-30' tenant-multi   # or use reflog / branch backup
git show tenant-multi@{1}:middleware.ts         # example; adjust ref to your backup
```

If you did not create a backup branch, use **`git reflog`** or **`origin/tenant-multi`** on GitHub (still has old commits until overwritten) to recover files.

## Postgres RPCs and tenant safety (merge hotspots)

Re-check after **upstream merges** or new RPCs:

| RPC / path | Tenant handling |
|------------|-----------------|
| `get_top_items_per_collection` | **Not tenant-filtered** in SQL. When `resolveEffectiveTenantId()` is set, [`collectionItemRepository`](lib/repositories/collectionItemRepository.ts) **skips** this RPC and uses a manual `collection_items` query with `applyTenantEq(..., tenantId)`. |
| `exec_sql` | Used by [`executeSql`](lib/supabase-server.ts) — **setup / admin** only; not per-tenant builder traffic. |
| `increment_webhook_failure_count`, `increment` | [`webhookRepository`](lib/repositories/webhookRepository.ts) — scope webhooks themselves if multi-tenant; RPCs operate on a single row id. |

Optional hardening: add `p_tenant_id` to `get_top_items_per_collection` and filter inside the function, or add `tenant_id` to `collection_imports` to avoid N+1 collection checks.

Fork helpers (keep when merging upstream): `lib/masjidweb/apply-tenant-eq.ts`, `tenant-query.ts`, `tenant-session-alignment.ts` (proxy JWT vs header), `supabase-builder-session.ts` (future RLS client), `npm test` (Vitest).

## After you are done bisecting

- Prefer **small, documented patches** or a **`lib/masjidweb/`** shim that calls core repos (see `.cursor/rules/ycode-upstream-fork.mdc`).
- Merge **`upstream/main`** regularly and re-apply only the minimal diff.
