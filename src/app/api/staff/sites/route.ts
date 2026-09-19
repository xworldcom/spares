import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { createSite, listSites } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }
  const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
  return json({ sites: await listSites(auth.tenantId, customerId ?? undefined) });
}

type CreateSiteBody = {
  customerId?: unknown;
  name?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreateSiteBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  const created = await createSite(auth.tenantId, customerId, name);
  if ("error" in created) {
    if (created.error === "taken") {
      return error("That site already exists for this customer", 409);
    }
    if (created.error === "bad-customer") {
      return error("Choose a valid customer", 400);
    }
    return error("Customer and site name are required", 400);
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "site.created",
    summary: `${auth.user.email} created site ${created.site.name}.`,
    target: { type: "site", id: created.site.id, label: created.site.name },
  });
  return json({ site: created.site }, 201);
}
