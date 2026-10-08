import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BLOB_FILES_PREFIX,
  blobActivityPath,
  blobCarePath,
  blobDbPath,
  blobPlatformSettingsPath,
} from "./blob-paths.ts";
import { isManagedRuntime } from "./production-env.ts";

export type StoreKind = "fs" | "blob" | "memory";

/**
 * A JSON read failed for a reason other than "the object does not exist yet".
 *
 * Callers must never treat this as an empty store: reseeding on a transient Blob error
 * overwrites every user, machine, and quote with fresh fixtures.
 */
export class PersistenceReadError extends Error {
  readonly pathname: string;

  constructor(pathname: string, options?: { cause?: unknown }) {
    super(
      `Could not read ${pathname} from durable storage. Refusing to overwrite it with a fresh catalog.`,
      options,
    );
    this.name = "PersistenceReadError";
    this.pathname = pathname;
  }
}

export type Persistence = {
  kind: StoreKind;
  readDatabaseJson(): Promise<string | null>;
  writeDatabaseJson(json: string): Promise<void>;
  readCareJson(): Promise<string | null>;
  writeCareJson(json: string): Promise<void>;
  readPlatformSettingsJson(): Promise<string | null>;
  writePlatformSettingsJson(json: string): Promise<void>;
  readActivityJson(): Promise<string | null>;
  writeActivityJson(json: string): Promise<void>;
  readFileBytes(name: string): Promise<Buffer | null>;
  writeFileBytes(name: string, bytes: Buffer): Promise<void>;
  deleteFileBytes(name: string): Promise<void>;
};

let override: Persistence | null = null;

export function safeStoredFileName(storedFileName: string) {
  const base = path.basename(storedFileName);
  if (!base || base !== storedFileName || !/^[A-Za-z0-9._-]+$/.test(base)) {
    throw new Error("Invalid stored file name");
  }
  return base;
}

export function getDataDir() {
  if (process.env.SPARES_DATA_DIR) {
    return path.resolve(process.env.SPARES_DATA_DIR);
  }
  if (process.env.VERCEL) {
    return "/tmp/spares-data";
  }
  return path.join(process.cwd(), "data");
}

export function filesDir() {
  return path.join(getDataDir(), "files");
}

export function createMemoryPersistence(): Persistence {
  let json: string | null = null;
  let careJson: string | null = null;
  let platformSettingsJson: string | null = null;
  let activityJson: string | null = null;
  const files = new Map<string, Buffer>();
  return {
    kind: "memory",
    async readDatabaseJson() {
      return json;
    },
    async writeDatabaseJson(next) {
      json = next;
    },
    async readCareJson() {
      return careJson;
    },
    async writeCareJson(next) {
      careJson = next;
    },
    async readPlatformSettingsJson() {
      return platformSettingsJson;
    },
    async writePlatformSettingsJson(next) {
      platformSettingsJson = next;
    },
    async readActivityJson() {
      return activityJson;
    },
    async writeActivityJson(next) {
      activityJson = next;
    },
    async readFileBytes(name) {
      const bytes = files.get(safeStoredFileName(name));
      return bytes ? Buffer.from(bytes) : null;
    },
    async writeFileBytes(name, bytes) {
      files.set(safeStoredFileName(name), Buffer.from(bytes));
    },
    async deleteFileBytes(name) {
      files.delete(safeStoredFileName(name));
    },
  };
}

export function setPersistenceForTests(next: Persistence | null) {
  override = next;
}

export function getPersistence(): Persistence {
  if (override) {
    return override;
  }
  return selectPersistence();
}

export function selectStoreKind(): StoreKind {
  if (override) {
    return override.kind;
  }
  if (process.env.SPARES_DATA_DIR && !process.env.VERCEL) {
    return "fs";
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return "blob";
  }
  return "fs";
}

function selectPersistence(): Persistence {
  if (process.env.SPARES_DATA_DIR && !process.env.VERCEL) {
    return fsPersistence(path.resolve(process.env.SPARES_DATA_DIR));
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return blobPersistence();
  }
  if (isManagedRuntime()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required on Vercel. Attach a Blob store. Quotes, users, and machine metadata cannot use /tmp.",
    );
  }
  return fsPersistence(getDataDir());
}

function fsPersistence(root: string): Persistence {
  const dbFile = path.join(root, "db.json");
  const careFile = path.join(root, "care.json");
  const platformSettingsFile = path.join(root, "platform-settings.json");
  const activityFile = path.join(root, "activity.json");
  const filesRoot = path.join(root, "files");
  return {
    kind: "fs",
    async readDatabaseJson() {
      return readJsonFile(dbFile);
    },
    async writeDatabaseJson(json) {
      await mkdir(filesRoot, { recursive: true });
      await writeFile(dbFile, json);
    },
    async readCareJson() {
      return readJsonFile(careFile);
    },
    async writeCareJson(json) {
      await mkdir(filesRoot, { recursive: true });
      await writeFile(careFile, json);
    },
    async readPlatformSettingsJson() {
      return readJsonFile(platformSettingsFile);
    },
    async writePlatformSettingsJson(json) {
      await mkdir(filesRoot, { recursive: true });
      await writeFile(platformSettingsFile, json);
    },
    async readActivityJson() {
      return readJsonFile(activityFile);
    },
    async writeActivityJson(json) {
      await mkdir(filesRoot, { recursive: true });
      await writeFile(activityFile, json);
    },
    async readFileBytes(name) {
      try {
        return await readFile(path.join(filesRoot, safeStoredFileName(name)));
      } catch {
        return null;
      }
    },
    async writeFileBytes(name, bytes) {
      await mkdir(filesRoot, { recursive: true });
      await writeFile(path.join(filesRoot, safeStoredFileName(name)), bytes);
    },
    async deleteFileBytes(name) {
      try {
        await unlink(path.join(filesRoot, safeStoredFileName(name)));
      } catch {
        // Missing files are fine during cleanup.
      }
    },
  };
}

/** Missing files are a first boot; anything else must not look like an empty store. */
async function readJsonFile(file: string) {
  try {
    return await readFile(file, "utf8");
  } catch (cause) {
    if ((cause as { code?: string })?.code === "ENOENT") {
      return null;
    }
    throw new PersistenceReadError(file, { cause });
  }
}

function blobPersistence(): Persistence {
  return {
    kind: "blob",
    async readDatabaseJson() {
      const bytes = await readJsonBlob(blobDbPath());
      return bytes ? bytes.toString("utf8") : null;
    },
    async writeDatabaseJson(json) {
      const { put } = await import("@vercel/blob");
      await put(blobDbPath(), json, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        // Blob CDN minimum is 60s; every read uses useCache: false.
        cacheControlMaxAge: 60,
        contentType: "application/json",
      });
    },
    async readCareJson() {
      const bytes = await readJsonBlob(blobCarePath());
      return bytes ? bytes.toString("utf8") : null;
    },
    async writeCareJson(json) {
      const { put } = await import("@vercel/blob");
      await put(blobCarePath(), json, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: "application/json",
      });
    },
    async readPlatformSettingsJson() {
      const bytes = await readJsonBlob(blobPlatformSettingsPath());
      return bytes ? bytes.toString("utf8") : null;
    },
    async writePlatformSettingsJson(json) {
      const { put } = await import("@vercel/blob");
      await put(blobPlatformSettingsPath(), json, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: "application/json",
      });
    },
    async readActivityJson() {
      const bytes = await readJsonBlob(blobActivityPath());
      return bytes ? bytes.toString("utf8") : null;
    },
    async writeActivityJson(json) {
      const { put } = await import("@vercel/blob");
      await put(blobActivityPath(), json, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: "application/json",
      });
    },
    async readFileBytes(name) {
      // Binaries are re-uploadable; a failed read stays "missing" as before.
      try {
        return await readBlob(blobFilePath(name));
      } catch {
        return null;
      }
    },
    async writeFileBytes(name, bytes) {
      const { put } = await import("@vercel/blob");
      const stored = safeStoredFileName(name);
      await put(blobFilePath(stored), bytes, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: contentTypeFor(stored),
        multipart: bytes.length > 4 * 1024 * 1024,
      });
    },
    async deleteFileBytes(name) {
      const { del } = await import("@vercel/blob");
      try {
        await del(blobFilePath(safeStoredFileName(name)));
      } catch {
        // Missing blobs are fine during cleanup.
      }
    },
  };
}

function blobFilePath(name: string) {
  return `${BLOB_FILES_PREFIX}${safeStoredFileName(name)}`;
}

function contentTypeFor(name: string) {
  if (name.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (name.endsWith(".glb")) {
    return "model/gltf-binary";
  }
  if (name.endsWith(".gltf")) {
    return "model/gltf+json";
  }
  if (name.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

async function readBlob(pathname: string): Promise<Buffer | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result) {
    return null;
  }
  if (result.statusCode !== 200) {
    throw new Error(`Blob ${pathname} returned status ${result.statusCode}`);
  }
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

function isMissingBlob(cause: unknown) {
  return cause instanceof Error && cause.name === "BlobNotFoundError";
}

const JSON_READ_ATTEMPTS = 3;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Catalog JSON is the source of truth for logins, so a rate limit or a dropped socket
 * must surface as an error rather than as "no catalog yet". Retry first, then throw.
 */
async function readJsonBlob(pathname: string): Promise<Buffer | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= JSON_READ_ATTEMPTS; attempt++) {
    try {
      return await readBlob(pathname);
    } catch (cause) {
      if (isMissingBlob(cause)) {
        return null;
      }
      lastError = cause;
      if (attempt < JSON_READ_ATTEMPTS) {
        await delay(150 * attempt);
      }
    }
  }
  throw new PersistenceReadError(pathname, { cause: lastError });
}
