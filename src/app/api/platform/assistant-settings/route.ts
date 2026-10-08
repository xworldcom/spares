import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { isAllowedAssistantModel } from "@/lib/assistant/models";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import {
  getPlatformAssistantSettingsFromCatalog,
  updatePlatformAssistantSettings,
} from "@/lib/store";
import { ASSISTANT_MODEL_OPTIONS } from "@/lib/assistant/models";

export const dynamic = "force-dynamic";

type PatchBody = {
  enabled?: unknown;
  model?: unknown;
};

export async function GET() {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const settings = await getPlatformAssistantSettingsFromCatalog();
  return json({
    enabled: settings.enabled,
    model: settings.model,
    models: ASSISTANT_MODEL_OPTIONS,
  });
}

async function handlePATCH(request: Request) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  if (typeof body.enabled !== "boolean") {
    return error("enabled must be a boolean", 400);
  }
  if (body.model !== undefined) {
    if (typeof body.model !== "string" || !isAllowedAssistantModel(body.model)) {
      return error("Pick a model from the platform list", 400);
    }
  }
  const { settings } = await updatePlatformAssistantSettings({
    enabled: body.enabled,
    model: typeof body.model === "string" ? body.model : undefined,
  });
  return json({
    enabled: settings.enabled,
    model: settings.model,
    models: ASSISTANT_MODEL_OPTIONS,
  });
}

export const PATCH = withCatalogConflict(handlePATCH);
