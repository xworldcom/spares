import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  isManualFilename,
  manualContentType,
} from "./care.ts";
import {
  getPersistence,
  safeStoredFileName,
  type StoreKind,
} from "./persistence.ts";
import { ensureR2BrowserCors } from "./r2-cors-sync.ts";
import {
  isS3Configured,
  modelDownloadUrlTtlSeconds,
  s3Bucket,
  s3Region,
} from "./s3-config.ts";

export type ManualStoreKind = "s3" | "inline";

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

let s3Client: S3Client | null = null;
let testS3Objects: Map<string, Buffer> | null = null;

export function setTestManualS3Objects(map: Map<string, Buffer> | null) {
  testS3Objects = map;
  s3Client = null;
}

export function safeManualFileName(storedFileName: string) {
  const base = storedFileName.split(/[/\\]/).pop() ?? "";
  if (!base || base !== storedFileName || !SAFE_NAME.test(base)) {
    throw new Error("Invalid stored file name");
  }
  return base;
}

/** Manuals live under `manuals/` so they never share the 3D model cost path. */
export function manualObjectKey(storedFileName: string) {
  return `manuals/${safeManualFileName(storedFileName)}`;
}

export function selectManualStoreKind(): ManualStoreKind {
  return isS3Configured() ? "s3" : "inline";
}

export function inlineManualStoreKind(): StoreKind {
  return getPersistence().kind;
}

export function vercelRequiresManualObjectStorageMessage() {
  return "Care manuals cannot upload on Vercel without object storage. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY (Cloudflare R2), then redeploy. Manuals are not stored on Vercel Blob.";
}

export function assertManualUploadAllowed() {
  if (process.env.VERCEL && !isS3Configured()) {
    throw new Error(vercelRequiresManualObjectStorageMessage());
  }
}

function getS3Client() {
  if (!isS3Configured()) {
    throw new Error("S3 object storage is not configured");
  }
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: s3Region(),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

function isS3MissingError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "NotFound" || error.name === "NoSuchKey";
}

async function readBody(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) {
    return null;
  }
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function readManualFileFromS3(name: string): Promise<Buffer | null> {
  const key = manualObjectKey(name);
  if (testS3Objects) {
    const bytes = testS3Objects.get(key);
    return bytes?.length ? Buffer.from(bytes) : null;
  }
  try {
    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
      }),
    );
    const bytes = await readBody(result.Body as ReadableStream<Uint8Array> | null);
    return bytes?.length ? bytes : null;
  } catch (error) {
    if (isS3MissingError(error)) {
      return null;
    }
    return null;
  }
}

export async function manualExistsInS3(storedFileName: string): Promise<boolean> {
  if (selectManualStoreKind() !== "s3") {
    return false;
  }
  const key = manualObjectKey(safeManualFileName(storedFileName));
  if (testS3Objects) {
    return testS3Objects.has(key);
  }
  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
      }),
    );
    return true;
  } catch (error) {
    if (isS3MissingError(error)) {
      return false;
    }
    return false;
  }
}

export async function readManualFile(storedFileName: string): Promise<Buffer | null> {
  const name = safeStoredFileName(storedFileName);
  if (selectManualStoreKind() === "s3") {
    const s3Bytes = await readManualFileFromS3(name);
    return s3Bytes?.length ? s3Bytes : null;
  }
  return getPersistence().readFileBytes(name);
}

export async function writeManualFile(storedFileName: string, bytes: Buffer) {
  assertManualUploadAllowed();
  const name = safeStoredFileName(storedFileName);
  if (!isManualFilename(name)) {
    throw new Error("Manual must be a PDF or Word document.");
  }
  const key = manualObjectKey(name);
  if (selectManualStoreKind() === "s3") {
    if (testS3Objects) {
      testS3Objects.set(key, Buffer.from(bytes));
      return;
    }
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
        Body: bytes,
        ContentType: manualContentType(name),
      }),
    );
    return;
  }
  await getPersistence().writeFileBytes(name, bytes);
}

export async function deleteManualFile(storedFileName: string) {
  const name = safeStoredFileName(storedFileName);
  const key = manualObjectKey(name);
  if (selectManualStoreKind() === "s3") {
    if (testS3Objects) {
      testS3Objects.delete(key);
      return;
    }
    try {
      await getS3Client().send(
        new DeleteObjectCommand({
          Bucket: s3Bucket(),
          Key: key,
        }),
      );
    } catch {
      // Missing objects are fine during cleanup.
    }
    return;
  }
  await getPersistence().deleteFileBytes(name);
}

export async function createManualUploadUrl(
  storedFileName: string,
  expiresInSeconds = 3600,
) {
  await ensureR2BrowserCors();
  assertManualUploadAllowed();
  if (selectManualStoreKind() !== "s3") {
    throw new Error("S3 object storage is not configured");
  }
  const name = safeManualFileName(storedFileName);
  const command = new PutObjectCommand({
    Bucket: s3Bucket(),
    Key: manualObjectKey(name),
    ContentType: manualContentType(name),
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
  return { uploadUrl, storedFileName: name };
}

export async function createManualDownloadUrl(
  storedFileName: string,
  expiresInSeconds = modelDownloadUrlTtlSeconds(),
) {
  await ensureR2BrowserCors();
  if (selectManualStoreKind() !== "s3") {
    throw new Error("S3 object storage is not configured");
  }
  const name = safeManualFileName(storedFileName);
  const command = new GetObjectCommand({
    Bucket: s3Bucket(),
    Key: manualObjectKey(name),
  });
  const downloadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
  return { downloadUrl, storedFileName: name };
}
