import { isAssistantActivity } from "./actor.ts";
import { userAskedForAssistant, userAskedToEscalate } from "./escalate.ts";

export type AssistantTriggerActivity = {
  kind: string;
  actorRole: string;
  actorEmail?: string;
  text?: string;
};

export function shouldAssistantReply(input: {
  enabled: boolean;
  paused: boolean;
  trigger: AssistantTriggerActivity;
  activities: readonly AssistantTriggerActivity[];
}): boolean {
  if (!input.enabled || input.paused) {
    return false;
  }
  if (input.trigger.kind !== "message") {
    return false;
  }
  if (isAssistantActivity(input.trigger)) {
    return false;
  }
  const last = lastMessage(input.activities);
  if (last && isAssistantActivity(last)) {
    return false;
  }
  if (input.trigger.actorRole === "customer") {
    return true;
  }
  return userAskedForAssistant(input.trigger.text ?? "");
}

function lastMessage(activities: readonly AssistantTriggerActivity[]) {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const row = activities[i];
    if (row.kind === "message") {
      return row;
    }
  }
  return undefined;
}

export function shouldForceEscalate(text: string): boolean {
  return userAskedToEscalate(text);
}
