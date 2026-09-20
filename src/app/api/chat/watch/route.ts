import { requireQuoteAccess } from "@/lib/quote-http";
import { requireTicketAccess } from "@/lib/care-http";
import {
  chatWatchChannel,
  waitForChatWatch,
  type ChatWatchKind,
} from "@/lib/chat-watch";
import { error, json } from "@/lib/http";

export const maxDuration = 30;

function parseKind(raw: string | null): ChatWatchKind | null {
  return raw === "ticket" || raw === "quote" ? raw : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const id = url.searchParams.get("id")?.trim() ?? "";
  const since = Number.parseInt(url.searchParams.get("since") ?? "0", 10);
  if (!kind || !id) {
    return error("Choose a ticket or quote to watch", 400);
  }
  if (!Number.isFinite(since) || since < 0) {
    return error("since must be a revision number", 400);
  }

  if (kind === "ticket") {
    const access = await requireTicketAccess(id);
    if ("error" in access) {
      return access.error;
    }
    const rev = await waitForChatWatch(chatWatchChannel("ticket", access.ticket.id), since, {
      signal: request.signal,
    });
    return json({ rev, changed: rev > since });
  }

  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }
  const rev = await waitForChatWatch(chatWatchChannel("quote", access.quote.id), since, {
    signal: request.signal,
  });
  return json({ rev, changed: rev > since });
}
