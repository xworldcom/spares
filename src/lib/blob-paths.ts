/** Private Blob object that holds JSON records. */
export const BLOB_DB_PATH = "spares/db.json";

/** Care manuals / tickets / usage — separate so catalog heals cannot clobber them. */
export const BLOB_CARE_PATH = "spares/care.json";

/** Platform-wide sign-in policy — separate so catalog heals cannot clobber it. */
export const BLOB_PLATFORM_SETTINGS_PATH = "spares/platform-settings.json";

/** Append-only account Activity Log — separate so catalog heals cannot clobber it. */
export const BLOB_ACTIVITY_PATH = "spares/activity.json";

/** Prefix for durable files (GLBs, PO PDFs, screenshots). */
export const BLOB_FILES_PREFIX = "spares/files/";

/**
 * Optional per-environment folder inside one Blob store. Preview deployments and Soft
 * Launch share `BLOB_READ_WRITE_TOKEN`, so a Preview smoke that renames a host or
 * deactivates a login writes straight into Soft Launch data. Set
 * `SPARES_BLOB_NAMESPACE` on the deployments that must stay isolated. Unset keeps the
 * historical paths, so existing Soft Launch data needs no migration.
 */
export function blobNamespace() {
  const raw = process.env.SPARES_BLOB_NAMESPACE?.trim().toLowerCase() ?? "";
  const slug = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `${slug}/` : "";
}

export function blobDbPath() {
  return `spares/${blobNamespace()}db.json`;
}

export function blobCarePath() {
  return `spares/${blobNamespace()}care.json`;
}

export function blobPlatformSettingsPath() {
  return `spares/${blobNamespace()}platform-settings.json`;
}

export function blobActivityPath() {
  return `spares/${blobNamespace()}activity.json`;
}
