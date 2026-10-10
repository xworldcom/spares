import { assistantActorLabel, isAssistantActivity } from "../assistant/actor.ts";
import type { QuoteActivity, Role } from "../../types/index.ts";
import { displayNameFromEmail } from "./display-name.ts";

/** iMessage-style sender line above a bubble (not shown on own / stacked rows). */
export function messageActorLabel(
  activity: Pick<QuoteActivity, "actorEmail" | "actorRole" | "kind">,
  viewer: { email: string; role: Role },
  actorNames?: Readonly<Record<string, string>>,
): string {
  if (isAssistantActivity(activity)) {
    return assistantActorLabel();
  }
  if (activity.actorEmail === viewer.email && activity.actorRole === viewer.role) {
    return "You";
  }
  const named = actorNames?.[activity.actorEmail]?.trim();
  if (named) {
    return named;
  }
  return displayNameFromEmail(activity.actorEmail);
}
