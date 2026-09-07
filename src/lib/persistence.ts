import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BLOB_DB_PATH, BLOB_FILES_PREFIX } from "./blob-paths.ts";

export type StoreKind = "fs" | "blob" | "memory";

export type Persistence = {
  kind: StoreKind;
  readDatabaseJson(): Promise<string | null>;
  writeDatabaseJson(json: string): Promise<void>;
  readFileBytes(name: string): Promise<Buffer | null>;
  writeFileBytes(name: string, bytes: Buffer): Promise<void>;
};

let override: Persistence | null = null;
let ephemeralWarned = false;

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
  const files = new Map<string, Buffer>();
  return {
    kind: "memory",
    async readDatabaseJson() {
      return json;
    },
    async writeDatabaseJson(next) {
      json = next;
    },
    async readFileBytes(name) {
      const bytes = files.get(safeStoredFileName(name));
      return bytes ? Buffer.from(bytes) : null;
    },
    async writeFileBytes(name, bytes) {
      files.set(safeStoredFileName(name), Buffer.from(bytes));
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
  if (process.env.VERCEL) {
    warnEphemeral();
  }
  return fsPersistence(getDataDir());
}

function warnEphemeral() {
  if (ephemeralWarned) {
    return;
  }
  ephemeralWarned = true;
  console.error(
    "[spares] BLOB_READ_WRITE_TOKEN is not set. Using ephemeral /tmp — quotes, activity, PO PDFs, and tracking will vanish across serverless instances. Create a Vercel Blob store, attach it to this project (Preview), and redeploy.",
  );
}

function fsPersistence(root: string): Persistence {
  const dbFile = path.join(root, "db.json");
  const filesRoot = path.join(root, "files");
  return {
    kind: "fs",
    async readDatabaseJson() {
      try {
        return await readFile(dbFile, "utf8");
      } catch {
        return null;
      }
    },
    async writeDatabaseJson(json) {
      await mkdir(filesRoot, { recursive: true });
      await writeFile(dbFile, json);
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
  };
}

function blobPersistence(): Persistence {
  return {
    kind: "blob",
    async readDatabaseJson() {
      const bytes = await readBlob(BLOB_DB_PATH);
      return bytes ? bytes.toString("utf8") : null;
    },
    async writeDatabaseJson(json) {
      const { put } = await import("@vercel/blob");
      await put(BLOB_DB_PATH, json, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        // Blob CDN minimum is 60s; every read uses useCache: false.
        cacheControlMaxAge: 60,
        contentType: "application/json",
      });
    },
    async readFileBytes(name) {
      return readBlob(blobFilePath(name));
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
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) {
      return null;
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  } catch {
    return null;
  }
}
