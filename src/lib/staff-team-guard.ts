import { canAssignStaffAcrossTenants } from "./tenant.ts";

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
  if (!requested || requested === actorTenantId) {
    return { ok: true, tenantId: actorTenantId };
  }
  if (!canAssignStaffAcrossTenants(input.actorEmail)) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, tenantId: requested };
}

/** POST /api/staff/team tenant resolution (tested with route-level cases). */
export function resolveStaffTeamPostTenant(input: {
  actorTenantId: string;
  actorEmail: string;
  requestedTenantId?: string | null;
}): StaffTeamTenantDecision {
  const actorTenantId = input.actorTenantId.trim();
  if (!actorTenantId) {
    return { ok: false, reason: "forbidden" };
  }
  return decideStaffTeamTenant({
    actorTenantId,
    actorEmail: input.actorEmail,
    requestedTenantId: input.requestedTenantId,
  });
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

/** Full POST /api/staff/team authorization (session tenant + DB actor + body tenantId). */
export function authorizeStaffTeamPost(input: {
  actorTenantId: string;
  actorEmail: string;
  sessionTenantId: string;
  requestedTenantId?: string | null;
}): StaffTeamTenantDecision {
  const actorTenantId = input.actorTenantId.trim();
  const sessionTenantId = input.sessionTenantId.trim();
  if (!actorTenantId || actorTenantId !== sessionTenantId) {
    return { ok: false, reason: "forbidden" };
  }

  const requested = input.requestedTenantId?.trim();
  if (
    requested &&
    requested !== actorTenantId &&
    !canAssignStaffAcrossTenants(input.actorEmail)
  ) {
    return { ok: false, reason: "forbidden" };
  }

  const tenantPick = resolveStaffTeamPostTenant({
    actorTenantId,
    actorEmail: input.actorEmail,
    requestedTenantId: input.requestedTenantId,
  });
  if (!tenantPick.ok) {
    return tenantPick;
  }

  if (
    !assertStaffTeamCreateAllowed({
      actorTenantId,
      actorEmail: input.actorEmail,
      targetTenantId: tenantPick.tenantId,
    })
  ) {
    return { ok: false, reason: "forbidden" };
  }

  if (!canAssignStaffAcrossTenants(input.actorEmail)) {
    return { ok: true, tenantId: actorTenantId };
  }

  return tenantPick;
}
