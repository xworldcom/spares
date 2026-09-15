import { isPlatformOwnerEmail } from "./tenant.ts";

export type StaffTeamTenantDecision =
  | { ok: true; tenantId: string }
  | { ok: false; reason: "forbidden" };

/**
 * Pick tenant for staff team list/create. Non–platform owners are always pinned to
 * their own tenantId; a different requested id is rejected (fail closed).
 */
export function decideStaffTeamTenant(input: {
  actorTenantId: string;
  actorEmail: string;
  requestedTenantId?: string | null;
}): StaffTeamTenantDecision {
  const actorTenantId = input.actorTenantId.trim();
  const requested = input.requestedTenantId?.trim();
  const platformOwner = isPlatformOwnerEmail(input.actorEmail);

  if (!requested || requested === actorTenantId) {
    return { ok: true, tenantId: actorTenantId };
  }
  if (!platformOwner) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, tenantId: requested };
}

/** Last-line check before persisting a staff user row. */
export function assertStaffTeamCreateAllowed(input: {
  actorTenantId: string;
  actorEmail: string;
  targetTenantId: string;
}): boolean {
  const decision = decideStaffTeamTenant({
    actorTenantId: input.actorTenantId,
    actorEmail: input.actorEmail,
    requestedTenantId: input.targetTenantId,
  });
  return decision.ok && decision.tenantId === input.targetTenantId;
}
