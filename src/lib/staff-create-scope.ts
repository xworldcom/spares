/** Which tenant a new staff login should be assigned to. */
export function resolveStaffCreateTenantId(input: {
  sessionTenantId: string;
  requestedTenantId?: string | null;
  platformOwner: boolean;
}): { tenantId: string } | { error: "forbidden" } {
  const sessionTenantId = input.sessionTenantId.trim();
  const requested = input.requestedTenantId?.trim();
  if (!requested || requested === sessionTenantId) {
    return { tenantId: sessionTenantId };
  }
  if (!input.platformOwner) {
    return { error: "forbidden" };
  }
  return { tenantId: requested };
}
