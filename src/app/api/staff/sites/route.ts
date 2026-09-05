import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { createSite, listSites } from "@/lib/store";

export async function GET() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }
  return json({ sites: await listSites() });
}

type CreateSiteBody = {
  company?: unknown;
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

  const company = typeof body.company === "string" ? body.company : "";
  const name = typeof body.name === "string" ? body.name : "";
  const created = await createSite(company, name);
  if ("error" in created) {
    if (created.error === "taken") {
      return error("That plant already exists", 409);
    }
    return error("Company and plant name are required", 400);
  }
  return json({ site: created.site }, 201);
}
