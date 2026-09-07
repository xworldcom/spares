import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { modelContentType } from "./machines.ts";
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

let s3Client: S3Client | null = null;

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

async function readBody(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) {
    return null;
  }
  return Buffer.from(await new Response(stream).arrayBuffer());
}

export async function readModelFile(storedFileName: string): Promise<Buffer | null> {
  const name = safeStoredFileName(storedFileName);
  if (selectModelStoreKind() === "s3") {
    try {
      const result = await getS3Client().send(
        new GetObjectCommand({
          Bucket: s3Bucket(),
          Key: modelObjectKey(name),
        }),
      );
      const bytes = await readBody(result.Body as ReadableStream<Uint8Array> | null);
      return bytes?.length ? bytes : null;
    } catch {
      return null;
    }
  }
  return getPersistence().readFileBytes(name);
}

export async function writeModelFile(storedFileName: string, bytes: Buffer) {
  const name = safeStoredFileName(storedFileName);
  if (selectModelStoreKind() === "s3") {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: modelObjectKey(name),
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
  if (selectModelStoreKind() === "s3") {
    try {
      await getS3Client().send(
        new DeleteObjectCommand({
          Bucket: s3Bucket(),
          Key: modelObjectKey(name),
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
    Key: modelObjectKey(name),
    ContentType: modelContentType(name),
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
  return { uploadUrl, storedFileName: name };
}
