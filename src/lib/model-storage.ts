import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { modelContentType } from "./machines.ts";
import {
  formatMegabytes,
  MODEL_BACKFILL_MAX_BYTES,
} from "./pack-limits.ts";
import {
  getPersistence,
  safeStoredFileName,
  type StoreKind,
} from "./persistence.ts";
import {
  isS3Configured,
  s3Bucket,
  s3Region,
} from "./s3-config.ts";
import { modelObjectKey } from "./model-url.ts";

export type ModelStoreKind = "s3" | "inline";

export type ModelBackfillStatus =
  | "copied"
  | "skipped_exists"
  | "skipped_missing"
  | "skipped_too_large"
  | "error";

export type ModelBackfillResult = {
  storedFileName: string;
  status: ModelBackfillStatus;
  message?: string;
  bytes?: number;
};

let s3Client: S3Client | null = null;
let testS3Objects: Map<string, Buffer> | null = null;

export function setTestS3Objects(map: Map<string, Buffer> | null) {
  testS3Objects = map;
  s3Client = null;
}

export function selectModelStoreKind(): ModelStoreKind {
  return isS3Configured() ? "s3" : "inline";
}

export { modelObjectKey, modelPublicUrl } from "./model-url.ts";

export function inlineDbStoreKind(): StoreKind {
  return getPersistence().kind;
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

function objectKey(name: string) {
  return modelObjectKey(name);
}

async function readBody(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) {
    return null;
  }
  return Buffer.from(await new Response(stream).arrayBuffer());
}

function isS3MissingError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "NotFound" || error.name === "NoSuchKey";
}

export async function readLegacyModelFile(
  storedFileName: string,
): Promise<Buffer | null> {
  const name = safeStoredFileName(storedFileName);
  return getPersistence().readFileBytes(name);
}

async function readModelFileFromS3(name: string): Promise<Buffer | null> {
  const key = objectKey(name);
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

export async function modelExistsInS3(storedFileName: string): Promise<boolean> {
  if (selectModelStoreKind() !== "s3") {
    return false;
  }
  const key = objectKey(safeStoredFileName(storedFileName));
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

export async function readModelFile(storedFileName: string): Promise<Buffer | null> {
  const name = safeStoredFileName(storedFileName);
  if (selectModelStoreKind() === "s3") {
    const s3Bytes = await readModelFileFromS3(name);
    if (s3Bytes?.length) {
      return s3Bytes;
    }
    return readLegacyModelFile(name);
  }
  return getPersistence().readFileBytes(name);
}

export async function writeModelFile(storedFileName: string, bytes: Buffer) {
  const name = safeStoredFileName(storedFileName);
  const key = objectKey(name);
  if (selectModelStoreKind() === "s3") {
    if (testS3Objects) {
      testS3Objects.set(key, Buffer.from(bytes));
      return;
    }
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
        Body: bytes,
        ContentType: modelContentType(name),
      }),
    );
    return;
  }
  await getPersistence().writeFileBytes(name, bytes);
}

export async function deleteModelFile(storedFileName: string) {
  const name = safeStoredFileName(storedFileName);
  const key = objectKey(name);
  if (selectModelStoreKind() === "s3") {
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

export async function createModelUploadUrl(
  storedFileName: string,
  expiresInSeconds = 3600,
) {
  const name = safeStoredFileName(storedFileName);
  const command = new PutObjectCommand({
    Bucket: s3Bucket(),
    Key: objectKey(name),
    ContentType: modelContentType(name),
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
  return { uploadUrl, storedFileName: name };
}

export async function createModelDownloadUrl(
  storedFileName: string,
  expiresInSeconds = 3600,
) {
  const name = safeStoredFileName(storedFileName);
  const command = new GetObjectCommand({
    Bucket: s3Bucket(),
    Key: objectKey(name),
  });
  const downloadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
  return { downloadUrl, storedFileName: name };
}

export async function backfillModelToS3(
  storedFileName: string,
): Promise<ModelBackfillResult> {
  const name = safeStoredFileName(storedFileName);
  if (selectModelStoreKind() !== "s3") {
    return {
      storedFileName: name,
      status: "error",
      message: "S3 object storage is not configured",
    };
  }
  if (await modelExistsInS3(name)) {
    return { storedFileName: name, status: "skipped_exists" };
  }
  const legacy = await readLegacyModelFile(name);
  if (!legacy?.length) {
    return { storedFileName: name, status: "skipped_missing" };
  }
  if (legacy.length > MODEL_BACKFILL_MAX_BYTES) {
    return {
      storedFileName: name,
      status: "skipped_too_large",
      bytes: legacy.length,
      message: `Model is ${formatMegabytes(legacy.length)} MB. Automatic backfill skips files over ${formatMegabytes(MODEL_BACKFILL_MAX_BYTES)} MB — re-upload the pack instead.`,
    };
  }
  await writeModelFile(name, legacy);
  return { storedFileName: name, status: "copied", bytes: legacy.length };
}

export function modelProxyRefusedMessage(bytes: number) {
  return `This model is not in object storage yet and is too large (${formatMegabytes(bytes)} MB) to stream through Vercel. Run POST /api/staff/machines/backfill-models while signed in as staff, or re-upload the pack.`;
}
