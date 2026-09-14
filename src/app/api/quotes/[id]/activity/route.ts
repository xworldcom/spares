import { verifyActivityAttachments } from "@/lib/chat-attachment-http";
import { parseChatActivityBody } from "@/lib/chat-attachments";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { actorOf, machineNameFor, requireQuoteAccess } from "@/lib/quote-http";
import { MAX_ACTIVITY_TEXT, toPublicQuote } from "@/lib/quotes";
import { appendQuoteActivity } from "@/lib/store";

type ActivityBody = {
  text?: unknown;
  attachments?: unknown;
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

  const parsed = parseChatActivityBody(body, MAX_ACTIVITY_TEXT, "Message");
  if (!parsed.ok) {
    return error(parsed.error, 400);
  }

  const verified = await verifyActivityAttachments(parsed.attachments);
  if (!verified.ok) {
    return error(verified.error, verified.status);
  }

  const next = await appendQuoteActivity(
    access.quote.id,
    actorOf(access.user),
    "message",
    parsed.text,
    parsed.attachments,
  );
  if (!next) {
    return error("Quote not found", 404);
  }

  return json(
    { quote: toPublicQuote(next, access.user, await machineNameFor(next)) },
    201,
  );
}
