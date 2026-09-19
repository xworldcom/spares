import type { PublicUser } from "../../types/index.ts";
import { getPlatformAssistantSettingsFromCatalog } from "../store.ts";

export async function attachStaffAssistantAvailability<T extends { assistantAvailable?: boolean }>(
  user: Pick<PublicUser, "role">,
  entity: T,
): Promise<T> {
  if (user.role !== "staff") {
    return entity;
  }
  const settings = await getPlatformAssistantSettingsFromCatalog();
  return { ...entity, assistantAvailable: settings.enabled };
}
