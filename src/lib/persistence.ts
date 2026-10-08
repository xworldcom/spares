import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
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

/** The two catalog documents that are read-modify-written by every mutation. */
export type CatalogDocument = "database" | "care";

/** Content plus an opaque version (Blob ETag, or a content hash on disk / in memory). */
export type VersionedJson = { json: string | null; version: string | null };

export type ConditionalWriteResult = { ok: true; version: string } | { ok: false };

export type Persistence = {
  kind: StoreKind;
  /**
   * Read a catalog document together with the version a later conditional write must
   * present. `version` is null exactly when the document does not exist yet.
   */
  readVersioned(doc: CatalogDocument): Promise<VersionedJson>;
  /**
   * Write only if the stored version still equals `expected` (null = must not exist).
   * Returns `{ ok: false }` when another writer got there first; callers re-read and retry.
   */
  writeIfVersion(
    doc: CatalogDocument,
    json: string,
    expected: string | null,
  ): Promise<ConditionalWriteResult>;
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
  const current = (doc: CatalogDocument) => (doc === "database" ? json : careJson);
  return {
    kind: "memory",
    async readVersioned(doc) {
      const value = current(doc);
      return { json: value, version: value === null ? null : contentVersion(value) };
    },
    async writeIfVersion(doc, next, expected) {
      const value = current(doc);
      if ((value === null ? null : contentVersion(value)) !== expected) {
        return { ok: false };
      }
      if (doc === "database") {
        json = next;
      } else {
        careJson = next;
      }
      return { ok: true, version: contentVersion(next) };
    },
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

export function contentVersion(json: string) {
  return createHash("sha256").update(json).digest("hex");
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
    return blobPersistence(vercelBlobClient);
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
  const fileFor = (doc: CatalogDocument) => (doc === "database" ? dbFile : careFile);
  return {
    kind: "fs",
    async readVersioned(doc) {
      const json = await readJsonFile(fileFor(doc));
      return { json, version: json === null ? null : contentVersion(json) };
    },
    async writeIfVersion(doc, json, expected) {
      const file = fileFor(doc);
      await mkdir(filesRoot, { recursive: true });
      return withFileLock(`${file}.lock`, async () => {
        const stored = await readJsonFile(file);
        if ((stored === null ? null : contentVersion(stored)) !== expected) {
          return { ok: false } as const;
        }
        await writeFileAtomic(file, json);
        return { ok: true, version: contentVersion(json) } as const;
      });
    },
    async readDatabaseJson() {
      return readJsonFile(dbFile);
    },
    async writeDatabaseJson(json) {
      await mkdir(filesRoot, { recursive: true });
      await withFileLock(`${dbFile}.lock`, () => writeFileAtomic(dbFile, json));
    },
    async readCareJson() {
      return readJsonFile(careFile);
    },
    async writeCareJson(json) {
      await mkdir(filesRoot, { recursive: true });
      await withFileLock(`${careFile}.lock`, () => writeFileAtomic(careFile, json));
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

/** Readers never see a half-written document: write a sibling, then rename over it. */
async function writeFileAtomic(file: string, json: string) {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temp, json);
    await rename(temp, file);
  } catch (cause) {
    await unlink(temp).catch(() => undefined);
    throw cause;
  }
}

const FILE_LOCK_STALE_MS = 15_000;
const FILE_LOCK_WAIT_MS = 20_000;

/**
 * Cross-process mutex for the local store, so compare-and-write is atomic between the
 * several Node processes that can share one data dir. `mkdir` is the atomic primitive.
 */
async function withFileLock<T>(lockDir: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  for (;;) {
    try {
      await mkdir(lockDir);
      break;
    } catch (cause) {
      if ((cause as { code?: string })?.code !== "EEXIST") {
        throw cause;
      }
      const held = await stat(lockDir).catch(() => null);
      if (held && Date.now() - held.mtimeMs > FILE_LOCK_STALE_MS) {
        await rmdir(lockDir).catch(() => undefined);
        continue;
      }
      if (Date.now() - started > FILE_LOCK_WAIT_MS) {
        throw new Error(`Timed out waiting for the store lock ${lockDir}`);
      }
      await delay(3 + Math.floor(Math.random() * 7));
    }
  }
  try {
    return await fn();
  } finally {
    await rmdir(lockDir).catch(() => undefined);
  }
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

/** The slice of `@vercel/blob` the store uses, so the CAS logic can run against a fake. */
export type BlobClient = {
  put(
    pathname: string,
    body: string | Buffer,
    options: Record<string, unknown>,
  ): Promise<{ etag: string }>;
  get(
    pathname: string,
    options: { access: "private"; useCache: false },
  ): Promise<{
    statusCode: number;
    stream: ReadableStream<Uint8Array> | null;
    blob: { etag: string };
  } | null>;
  del(pathname: string): Promise<void>;
};

const vercelBlobClient: BlobClient = {
  async put(pathname, body, options) {
    const { put } = await import("@vercel/blob");
    return put(pathname, body, options as unknown as Parameters<typeof put>[2]);
  },
  async get(pathname, options) {
    const { get } = await import("@vercel/blob");
    return get(pathname, options);
  },
  async del(pathname) {
    const { del } = await import("@vercel/blob");
    await del(pathname);
  },
};

function blobPathFor(doc: CatalogDocument) {
  return doc === "database" ? blobDbPath() : blobCarePath();
}

/** The SDK's error classes do not set `name`, so match on the stable message instead. */
function isPreconditionFailed(cause: unknown) {
  return (
    cause instanceof Error &&
    (cause.constructor?.name === "BlobPreconditionFailedError" ||
      /precondition failed/i.test(cause.message))
  );
}

function isAlreadyExists(cause: unknown) {
  return cause instanceof Error && /already exists/i.test(cause.message);
}

function isNotFoundError(cause: unknown) {
  return (
    cause instanceof Error &&
    (cause.constructor?.name === "BlobNotFoundError" || isMissingBlob(cause))
  );
}

export function createBlobPersistence(client: BlobClient = vercelBlobClient): Persistence {
  return blobPersistence(client);
}

function blobPersistence(client: BlobClient): Persistence {
  async function readVersionedBlob(pathname: string): Promise<VersionedJson> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= JSON_READ_ATTEMPTS; attempt++) {
      try {
        const result = await client.get(pathname, { access: "private", useCache: false });
        if (!result) {
          return { json: null, version: null };
        }
        if (result.statusCode !== 200 || !result.stream) {
          throw new Error(`Blob ${pathname} returned status ${result.statusCode}`);
        }
        const json = Buffer.from(await new Response(result.stream).arrayBuffer()).toString("utf8");
        return { json, version: result.blob.etag };
      } catch (cause) {
        if (isNotFoundError(cause)) {
          return { json: null, version: null };
        }
        lastError = cause;
        if (attempt < JSON_READ_ATTEMPTS) {
          await delay(150 * attempt);
        }
      }
    }
    throw new PersistenceReadError(pathname, { cause: lastError });
  }

  async function putIfVersion(
    doc: CatalogDocument,
    json: string,
    expected: string | null,
  ): Promise<ConditionalWriteResult> {
    const options = {
      access: "private",
      addRandomSuffix: false,
      // Blob CDN minimum is 60s; every read uses useCache: false.
      cacheControlMaxAge: 60,
      contentType: "application/json",
      ...(expected === null ? { allowOverwrite: false } : { allowOverwrite: true, ifMatch: expected }),
    };
    try {
      const written = await client.put(blobPathFor(doc), json, options);
      return { ok: true, version: written.etag };
    } catch (cause) {
      if (isPreconditionFailed(cause) || isAlreadyExists(cause) || isNotFoundError(cause)) {
        return { ok: false };
      }
      throw cause;
    }
  }

  async function putUnconditional(pathname: string, json: string) {
    await client.put(pathname, json, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json",
    });
  }

  return {
    kind: "blob",
    readVersioned(doc) {
      return readVersionedBlob(blobPathFor(doc));
    },
    writeIfVersion: putIfVersion,
    async readDatabaseJson() {
      const bytes = await readJsonBlob(blobDbPath());
      return bytes ? bytes.toString("utf8") : null;
    },
    async writeDatabaseJson(json) {
      await putUnconditional(blobDbPath(), json);
    },
    async readCareJson() {
      const bytes = await readJsonBlob(blobCarePath());
      return bytes ? bytes.toString("utf8") : null;
    },
    async writeCareJson(json) {
      await putUnconditional(blobCarePath(), json);
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
