import type { QuoteActivity } from "../../types/index.ts";
import { displayChatMessageText } from "./chat-message-text.ts";

/** One stored activity row expanded for chat UI (iOS used to coalesce sends with blank lines). */
export type ChatDisplayActivity = QuoteActivity & {
  displayKey: string;
  segmentIndex: number;
  segmentCount: number;
};

/**
 * Split a coalesced message body into per-send segments. Web/iOS must not merge new sends;
 * this only repairs legacy records that joined bodies with paragraph breaks.
 */
export function segmentChatMessageText(raw: string): string[] {
  const normalized = displayChatMessageText(raw);
  if (!normalized) {
    return [];
  }
  const parts = normalized
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return [normalized];
  }
  return parts;
}

export function expandActivitiesForChatDisplay<T extends QuoteActivity>(
  activities: readonly T[],
): ChatDisplayActivity[] {
  const expanded: ChatDisplayActivity[] = [];
  for (const activity of activities) {
    const hasAttachments = Boolean(activity.attachments?.length);
    if (activity.kind !== "message" || !activity.text?.trim() || hasAttachments) {
      expanded.push({
        ...activity,
        displayKey: activity.id,
        segmentIndex: 0,
        segmentCount: 1,
      });
      continue;
    }
    const segments = segmentChatMessageText(activity.text);
    if (segments.length <= 1) {
      expanded.push({
        ...activity,
        displayKey: activity.id,
        segmentIndex: 0,
        segmentCount: 1,
      });
      continue;
    }
    segments.forEach((text, index) => {
      const segment: ChatDisplayActivity = {
        ...activity,
        text,
        displayKey: `${activity.id}~${index}`,
        segmentIndex: index,
        segmentCount: segments.length,
      };
      if (hasAttachments && index === segments.length - 1) {
        segment.attachments = activity.attachments;
      }
      expanded.push(segment);
    });
  }
  return expanded;
}
