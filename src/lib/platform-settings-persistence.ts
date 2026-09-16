import { getPersistence } from "./persistence.ts";

/** Persisted in `platform-settings.json`, not `db.json`, so catalog heals cannot wipe it. */
export type PlatformSignInSettings = {
  passwordLoginEnabled?: boolean;
};

type PlatformSettingsDocument = PlatformSignInSettings & {
  schemaVersion?: number;
};

const SCHEMA_VERSION = 1;

function parsePlatformSettingsDocument(raw: string): PlatformSignInSettings | null {
  try {
    const parsed = JSON.parse(raw) as PlatformSettingsDocument;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.passwordLoginEnabled !== "boolean" && parsed.passwordLoginEnabled !== undefined) {
      return null;
    }
    return { passwordLoginEnabled: parsed.passwordLoginEnabled };
  } catch {
    return null;
  }
}

export async function readPersistedPlatformSignInSettings(): Promise<PlatformSignInSettings | null> {
  const raw = await getPersistence().readPlatformSettingsJson();
  if (raw === null) {
    return null;
  }
  return parsePlatformSettingsDocument(raw);
}

export async function writePersistedPlatformSignInSettings(
  settings: PlatformSignInSettings,
): Promise<void> {
  const doc: PlatformSettingsDocument = {
    schemaVersion: SCHEMA_VERSION,
    ...settings,
  };
  await getPersistence().writePlatformSettingsJson(JSON.stringify(doc, null, 2));
}
