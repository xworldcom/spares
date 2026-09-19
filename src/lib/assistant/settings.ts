import { resolveAssistantModel } from "./models.ts";

export type PlatformAssistantSettings = {
  enabled: boolean;
  model: string;
};

export function normalizeAssistantSettings(raw: {
  assistantEnabled?: boolean;
  assistantModel?: string;
} | null | undefined): PlatformAssistantSettings {
  return {
    enabled: raw?.assistantEnabled === true,
    model: resolveAssistantModel(raw?.assistantModel),
  };
}
