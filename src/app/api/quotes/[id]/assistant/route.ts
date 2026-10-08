import { machineNameFor, publicQuoteForUser, requireQuoteAccess } from "@/lib/quote-http";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { setQuoteAssistantPaused } from "@/lib/store";

type PatchBody = {
  paused?: unknown;
};

async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }
  if (access.user.role !== "staff") {
    return error("Only staff can turn AI off on a conversation", 403);
  }

  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  if (typeof body.paused !== "boolean") {
    return error("paused must be a boolean", 400);
  }

  const tenantId = userTenantId(access.user);
  const next = await setQuoteAssistantPaused(access.quote.id, tenantId, body.paused);
  if (!next) {
    return error("Quote not found", 404);
  }
  return json({
    quote: await publicQuoteForUser(next, access.user, await machineNameFor(next)),
  });
}

export const PATCH = withCatalogConflict(handlePATCH);
