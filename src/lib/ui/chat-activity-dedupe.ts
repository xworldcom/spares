import type { QuoteActivity } from "../../types/index.ts";
import { displayChatMessageText } from "./chat-message-text.ts";

const DUPLICATE_WINDOW_MS = 8_000;

type MessageLike = Pick<QuoteActivity, "kind" | "actorEmail" | "actorRole" | "text" | "at">;

function normalizedMessageBody(text: string) {
  return displayChatMessageText(text).trim();
}

/** True when `next` is a redundant consecutive send (create+POST probe, iOS double-tap, etc.). */
export function isDuplicateChatActivityPair(
  previous: MessageLike | undefined,
  next: MessageLike,
): boolean {
  if (!previous || previous.kind !== "message" || next.kind !== "message") {
    return false;
  }
  if (
    previous.actorEmail !== next.actorEmail ||
    previous.actorRole !== next.actorRole
  ) {
    return false;
  }
  const a = normalizedMessageBody(previous.text);
  const b = normalizedMessageBody(next.text);
  if (!a || !b || a !== b) {
    return false;
  }
  const prevAt = Date.parse(previous.at);
  const nextAt = Date.parse(next.at);
  if (!Number.isFinite(prevAt) || !Number.isFinite(nextAt)) {
    return true;
  }
  return Math.abs(nextAt - prevAt) <= DUPLICATE_WINDOW_MS;
}

function isDuplicateTimelinePair(
  previous: QuoteActivity | undefined,
  next: QuoteActivity,
): boolean {
  if (!previous || previous.kind !== next.kind) {
    return false;
  }
  if (previous.kind === "message") {
    return isDuplicateChatActivityPair(previous, next);
  }
  if (previous.text !== next.text) {
    return false;
  }
  const prevAt = Date.parse(previous.at);
  const nextAt = Date.parse(next.at);
  if (!Number.isFinite(prevAt) || !Number.isFinite(nextAt)) {
    return true;
  }
  return Math.abs(nextAt - prevAt) <= DUPLICATE_WINDOW_MS;
}

/** Safe render: drop back-to-back identical rows; storage unchanged. */
export function dedupeConsecutiveChatActivities<T extends QuoteActivity>(
  activities: readonly T[],
): T[] {
  const deduped: T[] = [];
  for (const activity of activities) {
    const prev = deduped.at(-1);
    if (isDuplicateTimelinePair(prev, activity)) {
      continue;
    }
    deduped.push(activity);
  }
  return deduped;
}

export function wouldDuplicateLatestTicketMessage(
  activities: readonly MessageLike[],
  actor: Pick<MessageLike, "actorEmail" | "actorRole">,
  text: string,
): boolean {
  const last = [...activities].reverse().find((row) => row.kind === "message");
  if (!last) {
    return false;
  }
  return isDuplicateChatActivityPair(last, {
    ...actor,
    kind: "message",
    text,
    at: new Date().toISOString(),
  });
}
