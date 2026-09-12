import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { createSite, listSites } from "@/lib/store";

export async function GET(request: Request) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }
  const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
  return json({ sites: await listSites(customerId ?? undefined) });
}

type CreateSiteBody = {
  customerId?: unknown;
  name?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreateSiteBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  const created = await createSite(customerId, name);
  if ("error" in created) {
    if (created.error === "taken") {
      return error("That site already exists for this customer", 409);
    }
    if (created.error === "bad-customer") {
      return error("Choose a valid customer", 400);
    }
    return error("Customer and site name are required", 400);
  }
  return json({ site: created.site }, 201);
}
