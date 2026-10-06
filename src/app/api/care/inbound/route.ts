import { inboundCareHttpResult } from "@/lib/care-ticket-email";
import { isErrorResponse, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson<unknown>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  const result = inboundCareHttpResult(body);
  return json(result.body, result.status);
}
