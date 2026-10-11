import type { PublicUser } from "../../types/index.ts";
import { getPlatformAssistantSettingsFromCatalog } from "../store.ts";

export async function staffAssistantEnabled(): Promise<boolean> {
  const settings = await getPlatformAssistantSettingsFromCatalog();
  return settings.enabled;
}

export function withStaffAssistantAvailability<T extends { assistantAvailable?: boolean }>(
  user: Pick<PublicUser, "role">,
  entity: T,
  enabled: boolean,
): T {
  if (user.role !== "staff") {
    return entity;
  }
  return { ...entity, assistantAvailable: enabled };
}

export async function attachStaffAssistantAvailability<T extends { assistantAvailable?: boolean }>(
  user: Pick<PublicUser, "role">,
  entity: T,
): Promise<T> {
  if (user.role !== "staff") {
    return entity;
  }
  return withStaffAssistantAvailability(user, entity, await staffAssistantEnabled());
}
