import { parseBlobCasTelemetry, type BlobCasTelemetry } from "./blob-cas-telemetry.ts";
import { updateJsonDocument } from "./json-document.ts";
import { getPersistence } from "./persistence.ts";

/** Persisted in `platform-settings.json`, not `db.json`, so catalog heals cannot wipe it. */
export type PlatformSignInSettings = {
  passwordLoginEnabled?: boolean;
};

export type PlatformSettingsDocument = {
  schemaVersion?: number;
  passwordLoginEnabled?: boolean;
  assistantEnabled?: boolean;
  assistantModel?: string;
  blobCas?: BlobCasTelemetry;
};

const SCHEMA_VERSION = 2;

function parsePlatformSettingsDocument(raw: string): PlatformSettingsDocument | null {
  try {
    const parsed = JSON.parse(raw) as PlatformSettingsDocument;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const next: PlatformSettingsDocument = {};
    if (typeof parsed.passwordLoginEnabled === "boolean") {
      next.passwordLoginEnabled = parsed.passwordLoginEnabled;
    } else if (parsed.passwordLoginEnabled !== undefined) {
      return null;
    }
    if (typeof parsed.assistantEnabled === "boolean") {
      next.assistantEnabled = parsed.assistantEnabled;
    } else if (parsed.assistantEnabled !== undefined) {
      return null;
    }
    if (typeof parsed.assistantModel === "string") {
      next.assistantModel = parsed.assistantModel;
    } else if (parsed.assistantModel !== undefined) {
      return null;
    }
    const blobCas = parseBlobCasTelemetry(parsed as Record<string, unknown>);
    if (Object.keys(blobCas).length > 0) {
      next.blobCas = blobCas;
    }
    return next;
  } catch {
    return null;
  }
}

export async function readPersistedPlatformSettings(): Promise<PlatformSettingsDocument | null> {
  const raw = await getPersistence().readPlatformSettingsJson();
  if (raw === null) {
    return null;
  }
  return parsePlatformSettingsDocument(raw);
}

export async function writePersistedPlatformSettings(
  patch: PlatformSettingsDocument,
): Promise<PlatformSettingsDocument> {
  return await updateJsonDocument("platformSettings", (raw) => {
    const current = (raw === null ? null : parsePlatformSettingsDocument(raw)) ?? {};
    const next: PlatformSettingsDocument = {
      ...current,
      ...patch,
      schemaVersion: SCHEMA_VERSION,
    };
    return { json: JSON.stringify(next, null, 2), result: next };
  });
}

export async function readPersistedPlatformSignInSettings(): Promise<PlatformSignInSettings | null> {
  const doc = await readPersistedPlatformSettings();
  if (!doc) {
    return null;
  }
  return { passwordLoginEnabled: doc.passwordLoginEnabled };
}

export async function writePersistedPlatformSignInSettings(
  settings: PlatformSignInSettings,
): Promise<void> {
  await writePersistedPlatformSettings({
    passwordLoginEnabled: settings.passwordLoginEnabled,
  });
}
