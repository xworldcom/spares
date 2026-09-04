import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { actorOf, machineNameFor, requireQuoteAccess } from "@/lib/quote-http";
import { parseActivityText, toPublicQuote } from "@/lib/quotes";
import { appendQuoteActivity } from "@/lib/store";

type ActivityBody = {
  text?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const body = await readJson<ActivityBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const parsed = parseActivityText(body.text);
  if (!parsed.ok) {
    return error(parsed.error, 400);
  }

  const next = await appendQuoteActivity(
    access.quote.id,
    actorOf(access.user),
    "message",
    parsed.text,
  );
  if (!next) {
    return error("Quote not found", 404);
  }

  return json(
    { quote: toPublicQuote(next, access.user, await machineNameFor(next)) },
    201,
  );
}
