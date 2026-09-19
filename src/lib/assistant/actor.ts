import type { ActivityActorRole } from "../../types/index.ts";

export const ASSISTANT_ID = "assistant";
export const ASSISTANT_EMAIL = "ai@oee360.local";
export const ASSISTANT_NAME = "AI";
export const ASSISTANT_ROLE: ActivityActorRole = "assistant";

export const ASSISTANT_ACTOR = {
  id: ASSISTANT_ID,
  email: ASSISTANT_EMAIL,
  role: ASSISTANT_ROLE,
  name: ASSISTANT_NAME,
} as const;

export function isAssistantRole(role: string | undefined): role is "assistant" {
  return role === "assistant";
}

export function isAssistantActivity(activity: {
  actorRole?: string;
  actorEmail?: string;
}): boolean {
  return (
    isAssistantRole(activity.actorRole) || activity.actorEmail === ASSISTANT_EMAIL
  );
}

export function assistantActorLabel(): string {
  return ASSISTANT_NAME;
}
