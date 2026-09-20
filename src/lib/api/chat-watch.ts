import { apiFetch } from "./client";
import { invalidateWarmRead } from "./warm-read";
import type { ChatWatchKind } from "../chat-watch";

/** Hang up a dead wait and listen again. Server hold is 25s. */
export const CONVERSATION_WATCH_CLIENT_MS = 35_000;

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
  const local = new AbortController();
  const timer = setTimeout(() => local.abort(), CONVERSATION_WATCH_CLIENT_MS);
  const onParentAbort = () => local.abort();
  input.signal?.addEventListener("abort", onParentAbort);
  if (input.signal?.aborted) {
    local.abort();
  }
  try {
    return await apiFetch<{ rev: number; changed: boolean }>(`/api/chat/watch?${params}`, {
      signal: local.signal,
    });
  } catch (cause) {
    if (input.signal?.aborted) {
      throw cause;
    }
    if (local.signal.aborted) {
      return { rev: input.since, changed: false };
    }
    throw cause;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onParentAbort);
  }
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
