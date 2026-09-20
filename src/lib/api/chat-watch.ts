import { apiFetch } from "./client";
import { invalidateWarmRead } from "./warm-read";
import type { ChatWatchKind } from "../chat-watch";

export async function waitForConversationWatch(input: {
  kind: ChatWatchKind;
  id: string;
  since: number;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    kind: input.kind,
    id: input.id,
    since: String(Math.max(0, input.since)),
  });
  return apiFetch<{ rev: number; changed: boolean }>(`/api/chat/watch?${params}`, {
    signal: input.signal,
  });
}

export function invalidateConversationWarmRead(kind: ChatWatchKind, _id: string) {
  if (kind === "ticket") {
    invalidateWarmRead("ticket");
    invalidateWarmRead("tickets:accessible");
    return;
  }
  invalidateWarmRead("quote");
  invalidateWarmRead("quotes:list");
}
