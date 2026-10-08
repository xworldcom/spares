import {
  parseSsoAutoroute,
  parseSsoDomains,
  parseSsoTenantIds,
} from "@/lib/auth/sso-domain";
import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { AUTOROUTE_NEEDS_ENROLLMENT_MESSAGE } from "@/lib/platform-tenant-create";
import { parseDisplayTicketEmail } from "@/lib/care-ticket-email";
import { updateTenantPlatformMeta, removePlatformTenant } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tenantId: string }> };

type PatchBody = {
  name?: unknown;
  inactive?: unknown;
  ssoDomains?: unknown;
  ssoTenantIds?: unknown;
  ssoAutoroute?: unknown;
  ticketEmailDisplay?: unknown;
};

async function handlePATCH(request: Request, context: Params) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const { tenantId } = await context.params;
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const name = typeof body.name === "string" ? body.name : undefined;
  const inactive =
    typeof body.inactive === "boolean" ? body.inactive : undefined;
  let ssoDomains: string[] | undefined;
  if (body.ssoDomains !== undefined) {
    const parsed = parseSsoDomains(body.ssoDomains);
    if (!parsed.ok) {
      return error(parsed.message, parsed.status);
    }
    ssoDomains = parsed.domains;
  }
  let ssoTenantIds: string[] | undefined;
  if (body.ssoTenantIds !== undefined) {
    const parsed = parseSsoTenantIds(body.ssoTenantIds);
    if (!parsed.ok) {
      return error(parsed.message, parsed.status);
    }
    ssoTenantIds = parsed.tenantIds;
  }
  const ssoAutoroute = parseSsoAutoroute(body.ssoAutoroute);
  let ticketEmailDisplay: string | null | undefined;
  if (body.ticketEmailDisplay !== undefined) {
    const parsed = parseDisplayTicketEmail(body.ticketEmailDisplay);
    if (!parsed.ok) {
      return error(parsed.message, 400);
    }
    ticketEmailDisplay = parsed.address;
  }

  if (
    name === undefined &&
    inactive === undefined &&
    ssoDomains === undefined &&
    ssoTenantIds === undefined &&
    ssoAutoroute === undefined &&
    ticketEmailDisplay === undefined
  ) {
    return error("No changes requested", 400);
  }

  const updated = await updateTenantPlatformMeta(tenantId, {
    name,
    inactive,
    ssoDomains,
    ssoTenantIds,
    ssoAutoroute,
    ticketEmailDisplay,
  });
  if ("error" in updated) {
    if (updated.error === "not-found") {
      return error("Tenant not found", 404);
    }
    if (updated.error === "taken") {
      return error("A tenant with that name already exists", 409);
    }
    if (updated.error === "domain-taken") {
      return error("That SSO domain is already assigned to another host", 409);
    }
    if (updated.error === "autoroute-needs-enrollment") {
      return error(AUTOROUTE_NEEDS_ENROLLMENT_MESSAGE, 400);
    }
    if (updated.error === "host-immutable") {
      return error("The Soft Launch host cannot be suspended", 400);
    }
    if (updated.error === "local-part-taken") {
      return error("That inbound address is already assigned to another host", 409);
    }
    return error("Invalid tenant name", 400);
  }

  await recordAccountActivity({
    tenantId: updated.tenant.id,
    actor: actorFromUser(auth.user),
    action: "tenant.updated",
    summary: `${auth.user.email} updated host ${updated.tenant.name}.`,
    target: { type: "tenant", id: updated.tenant.id, label: updated.tenant.name },
    details: {
      name: name ?? null,
      inactive: inactive ?? null,
      ssoDomains: ssoDomains?.join(", ") ?? null,
      ssoTenantIds: ssoTenantIds?.join(", ") ?? null,
      ssoAutoroute: ssoAutoroute ?? null,
      ticketEmailDisplay: ticketEmailDisplay ?? null,
    },
  });
  return json({ tenant: updated.tenant });
}

async function handleDELETE(_request: Request, context: Params) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const { tenantId } = await context.params;
  const removed = await removePlatformTenant(tenantId);
  if ("error" in removed) {
    if (removed.error === "not-found") {
      return error("Tenant not found", 404);
    }
    if (removed.error === "host-immutable") {
      return error("The Soft Launch host cannot be deleted", 400);
    }
    if (removed.error === "has-children") {
      return error(
        "Remove all staff, customers, sites, machines, and open work on this host before deleting it",
        409,
      );
    }
    return error("Could not delete host", 400);
  }

  await recordAccountActivity({
    tenantId,
    actor: actorFromUser(auth.user),
    action: "tenant.deleted",
    summary: `${auth.user.email} removed host ${tenantId}.`,
    target: { type: "tenant", id: tenantId },
  });
  return json({ ok: true });
}

export const PATCH = withCatalogConflict(handlePATCH);
export const DELETE = withCatalogConflict(handleDELETE);
