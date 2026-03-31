/**
 * Pure PostgREST helper — safe to import from client tests without pulling server-only repos.
 */

export function applyTenantEq<
  Q extends { eq: (column: string, value: string) => Q },
>(query: Q, tenantId: string | null | undefined): Q {
  if (tenantId) {
    return query.eq('tenant_id', tenantId);
  }
  return query;
}
