import { assistantActorLabel, isAssistantActivity } from "../assistant/actor.ts";
import type { QuoteActivity, Role } from "../../types/index.ts";
import { messageSenderDisplayName } from "./message-sender-display.ts";

/** iMessage-style sender line above a bubble (not shown on own / stacked rows). */
export function messageActorLabel(
  activity: Pick<QuoteActivity, "actorEmail" | "actorRole" | "kind">,
  viewer: { email: string; role: Role },
  actorDisplayNames?: Readonly<Record<string, string>>,
): string {
  if (isAssistantActivity(activity)) {
    return assistantActorLabel();
  }
  if (activity.actorEmail === viewer.email && activity.actorRole === viewer.role) {
    return "You";
  }
  const named = actorDisplayNames?.[activity.actorEmail];
  if (named) {
    return named;
  }
  return messageSenderDisplayName({ email: activity.actorEmail });
}

/** Sender chrome for any human message (including staff-own rows on staff view). */
export function chatSenderLabel(
  activity: Pick<QuoteActivity, "actorEmail" | "actorRole" | "kind">,
  viewer: { email: string; role: Role },
  actorDisplayNames?: Readonly<Record<string, string>>,
): string {
  if (isAssistantActivity(activity)) {
    return assistantActorLabel();
  }
  const own =
    activity.actorEmail === viewer.email && activity.actorRole === viewer.role;
  if (own && activity.actorRole !== "staff") {
    return "You";
  }
  const named = actorDisplayNames?.[activity.actorEmail];
  if (named) {
    return named;
  }
  return messageSenderDisplayName({ email: activity.actorEmail });
}
