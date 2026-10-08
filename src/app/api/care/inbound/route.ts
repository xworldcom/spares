import { inboundCareHttpResult } from "@/lib/care-ticket-email";
import { isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";

export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  const body = await readJson<unknown>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  const result = inboundCareHttpResult(body);
  return json(result.body, result.status);
}

export const POST = withCatalogConflict(handlePOST);
