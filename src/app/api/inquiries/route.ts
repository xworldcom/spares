import {
  parseAccessInquiryBody,
  type AccessInquiryInput,
} from "@/lib/access-inquiry";
import { isSameOriginRequest } from "@/lib/cors";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { allowRateLimit, clientIp } from "@/lib/rate-limit";
import { createAccessInquiry } from "@/lib/store";

type CreateInquiryBody = AccessInquiryInput & { company_fax?: unknown };

const MAX_INQUIRY_BYTES = 16 * 1024;

async function handlePOST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return error("Origin not allowed", 403);
  }
  if (!allowRateLimit(`inquiry:${clientIp(request)}`, 4, 60_000)) {
    return error("Too many requests. Try again in a minute.", 429);
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_INQUIRY_BYTES) {
    return error("Request too large", 413);
  }

  const body = await readJson<CreateInquiryBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const parsed = parseAccessInquiryBody(body);
  if (!parsed.ok) {
    return error(parsed.message, parsed.status);
  }

  const inquiry = await createAccessInquiry({
    ...parsed.value,
    submitterIp: clientIp(request),
  });

  return json(
    {
      ok: true,
      id: inquiry.id,
      message:
        "Thanks — your inquiry is in our queue. A platform owner will review it and reach out if there is a fit.",
    },
    201,
  );
}

export const POST = withCatalogConflict(handlePOST);
