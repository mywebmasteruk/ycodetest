# Multi-tenant / MasjidWeb customisations — reapply checklist

The `tenant-multi` branch was reset toward **vanilla YCode** (`upstream/main`) for the builder, data layer, Supabase server, and routing. The items below were **removed or reverted** and can be reintroduced **one at a time** to find what breaks publish or the editor.

## Critical warning (read first)

- **Database** still has **multi-tenant schema** (e.g. `tenant_id`, per-tenant unique indexes) from migrations that were **kept**:
  - `database/migrations/20260325120000_pages_slug_unique_per_tenant.ts`
  - `database/migrations/20260325130000_tenant_scope_unique_constraints.ts`
- **Code** uses the **service role** via `getSupabaseAdmin()`; **app-layer** `tenant_id` filters are being restored incrementally (RLS is not assumed). **Done:** `settingsRepository`, `pageRepository`, `pageLayersRepository`, `pageFolderRepository` (via `resolveEffectiveTenantId()` when non-null). **Still pending:** collections, components, public `page-fetcher` / `generateStaticParams`, and other repos listed below.
- On a **shared Supabase** with multiple tenants, the builder and public site can see **mixed or duplicate rows** (e.g. multiple `published_at` / same `key` in `settings`). **Do not treat production as secure or correct until tenant scoping is restored** (or use a **single-tenant copy** of the DB for debugging).

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

- **Routing:** removed root `middleware.ts`; added **`proxy.ts`** (auth / public API only — **no subdomain tenant resolution**).
- **`lib/supabase-server.ts`:** service-role client only (no session + tenant header layering).
- **`lib/supabase-browser.ts`:** upstream version (no shared cookie-domain helper).
- **Repositories:** `collections`, `collectionItem`, `components`, `layer_styles`, `locales`, `fonts`, `assets`, `asset_folders`, etc. — still **without** per-request `resolveEffectiveTenantId()` scoping (unlike `settings` + pages tree repos after the latest fork work).
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

## After you are done bisecting

- Prefer **small, documented patches** or a **`lib/masjidweb/`** shim that calls core repos (see `.cursor/rules/ycode-upstream-fork.mdc`).
- Merge **`upstream/main`** regularly and re-apply only the minimal diff.
