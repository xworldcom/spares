import type { QuoteActivity, Role } from "../../types/index.ts";

export type ActivityLane = "own" | "other" | "system";

export function activityLane(
  activity: Pick<QuoteActivity, "kind" | "actorEmail" | "actorRole">,
  self: { email: string; role: Role },
): ActivityLane {
  if (activity.kind !== "message") {
    return "system";
  }
  if (activity.actorEmail === self.email && activity.actorRole === self.role) {
    return "own";
  }
  return "other";
}

export function sameMessageAuthor(
  current: Pick<QuoteActivity, "kind" | "actorEmail" | "actorRole">,
  other?: Pick<QuoteActivity, "kind" | "actorEmail" | "actorRole">,
) {
  if (!other || current.kind !== "message" || other.kind !== "message") {
    return false;
  }
  return current.actorEmail === other.actorEmail && current.actorRole === other.actorRole;
}
