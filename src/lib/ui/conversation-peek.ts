import { activityLane } from "./activity-lane.ts";
import type { QuoteActivity, Role } from "../../types/index.ts";

export function conversationPeekLine(
  activities: QuoteActivity[],
  self: { email: string; role: Role },
): { text: string; unreadHint: boolean } {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i];
    const lane = activityLane(activity, self);
    if (lane === "system") {
      const trimmed = activity.text.trim();
      if (trimmed) {
        return { text: trimmed, unreadHint: false };
      }
      continue;
    }
    const body = activity.text.trim();
    if (body) {
      return { text: body, unreadHint: false };
    }
    if (activity.attachments?.length) {
      return { text: "Attachment", unreadHint: false };
    }
  }
  return { text: "No messages yet", unreadHint: false };
}
