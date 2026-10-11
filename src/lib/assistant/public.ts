import type { PublicUser } from "../../types/index.ts";
import {
  formatCatalogVersionKey,
  peekCatalogVersionsCoalesced,
} from "../catalog-version-peek.ts";
import { getPlatformAssistantSettingsFromCatalog } from "../store.ts";

let assistantEnabledCache: { catalogKey: string; enabled: boolean } | null = null;

export async function staffAssistantEnabled(): Promise<boolean> {
  const catalogKey = formatCatalogVersionKey(await peekCatalogVersionsCoalesced());
  if (assistantEnabledCache && assistantEnabledCache.catalogKey === catalogKey) {
    return assistantEnabledCache.enabled;
  }
  const settings = await getPlatformAssistantSettingsFromCatalog();
  assistantEnabledCache = { catalogKey, enabled: settings.enabled };
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
