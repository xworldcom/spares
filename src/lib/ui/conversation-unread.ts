import { activityLane } from "./activity-lane.ts";
import type { QuoteActivity, Role } from "../../types/index.ts";

/** Index of the first message from others after the viewer's read watermark. */
export function firstUnreadActivityIndex(
  activities: readonly QuoteActivity[],
  viewer: Pick<{ email: string; role: Role }, "email" | "role">,
  viewerReadAt: string | undefined,
): number | null {
  for (let index = 0; index < activities.length; index += 1) {
    const activity = activities[index];
    if (activityLane(activity, viewer) !== "other") {
      continue;
    }
    if (!viewerReadAt || activity.at > viewerReadAt) {
      return index;
    }
  }
  return null;
}
