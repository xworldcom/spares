import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  CHAT_ATTACHMENT_PROXY_MAX_BYTES,
  CHAT_MULTIPART_PART_BYTES,
  CHAT_MULTIPART_THRESHOLD_BYTES,
  chatAttachmentPreviewTooLargeMessage,
  chatObjectKey,
  isChatStoredFileName,
  validateChatUploadInput,
} from "./chat-attachments.ts";
import { shouldUseCrossOriginObjectUrl } from "./cors.ts";
import { ensureR2BrowserCors } from "./r2-cors-sync.ts";
import { StoredFileClaimedError } from "./stored-file-claim.ts";
import {
  isS3Configured,
  modelDownloadUrlTtlSeconds,
  modelUploadUrlTtlSeconds,
  s3Bucket,
  s3Region,
} from "./s3-config.ts";

export type ChatUploadMode = "put" | "multipart";

export type ChatPutUploadTicket = {
  method: "PUT";
  uploadUrl: string;
  storedFileName: string;
  r2Key: string;
  contentType: string;
};

export type ChatMultipartUploadTicket = {
  method: "multipart";
  uploadId: string;
  storedFileName: string;
  r2Key: string;
  contentType: string;
  partSize: number;
  parts: Array<{ partNumber: number; uploadUrl: string }>;
};

export type ChatProxyUploadTicket = {
  method: "proxy";
  uploadUrl: string;
  storedFileName: string;
  r2Key: string;
  contentType: string;
};

export type ChatUploadTicket =
  | ChatPutUploadTicket
  | ChatMultipartUploadTicket
  | ChatProxyUploadTicket;

let s3Client: S3Client | null = null;
let testS3Objects: Map<string, Buffer> | null = null;

export function setTestChatS3Objects(map: Map<string, Buffer> | null) {
  testS3Objects = map;
  s3Client = null;
}

export function vercelRequiresChatObjectStorageMessage() {
  return "Chat files need object storage on Vercel. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY, then redeploy.";
}

export function assertChatAttachmentUploadAllowed() {
  if (process.env.VERCEL && !isS3Configured()) {
    throw new Error(vercelRequiresChatObjectStorageMessage());
  }
}

export function selectChatAttachmentStoreKind() {
  return isS3Configured() ? "s3" : "inline";
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

function safeChatStoredFileName(storedFileName: string) {
  if (!isChatStoredFileName(storedFileName)) {
    throw new Error("Invalid stored file name");
  }
  return storedFileName;
}

function isS3MissingError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "NotFound" || error.name === "NoSuchKey";
}

export function chatUploadMode(sizeBytes: number): ChatUploadMode {
  return sizeBytes > CHAT_MULTIPART_THRESHOLD_BYTES ? "multipart" : "put";
}

export function chatMultipartPartCount(sizeBytes: number) {
  return Math.ceil(sizeBytes / CHAT_MULTIPART_PART_BYTES);
}

export function createChatAttachmentProxyUploadTicket(
  input: {
    storedFileName: string;
    originalFileName: string;
    sizeBytes: number;
    contentType?: string;
  },
  proxyUploadPath: string,
): ChatProxyUploadTicket {
  assertChatAttachmentUploadAllowed();
  if (selectChatAttachmentStoreKind() !== "s3") {
    throw new Error("Direct-to-storage upload is only available when R2/S3 is configured.");
  }
  const validated = validateChatUploadInput(
    input.originalFileName,
    input.sizeBytes,
    input.contentType,
  );
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  const storedFileName = safeChatStoredFileName(input.storedFileName);
  const path = proxyUploadPath.trim();
  if (!path.startsWith("/")) {
    throw new Error("Invalid proxy upload path.");
  }
  return {
    method: "proxy",
    uploadUrl: path,
    storedFileName,
    r2Key: chatObjectKey(storedFileName),
    contentType: validated.contentType,
  };
}

export async function putChatAttachmentObject(
  storedFileName: string,
  body: Uint8Array,
  contentType: string,
) {
  assertChatAttachmentUploadAllowed();
  const name = safeChatStoredFileName(storedFileName);
  const key = chatObjectKey(name);
  if (testS3Objects) {
    if (testS3Objects.has(key)) {
      throw new StoredFileClaimedError("chat");
    }
    testS3Objects.set(key, Buffer.from(body));
    return;
  }
  if (await chatAttachmentExists(storedFileName)) {
    throw new StoredFileClaimedError("chat");
  }
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export type ChatAttachmentUploadPlan =
  | { ok: true; ticket: ChatUploadTicket }
  | { ok: false; error: string; status: number };

export async function planChatAttachmentUpload(
  request: Request,
  input: {
    storedFileName: string;
    originalFileName: string;
    sizeBytes: number;
    contentType?: string;
  },
  proxyUploadPath: string,
): Promise<ChatAttachmentUploadPlan> {
  assertChatAttachmentUploadAllowed();
  if (selectChatAttachmentStoreKind() !== "s3") {
    return {
      ok: false,
      error: "Direct-to-storage upload is only available when R2/S3 is configured.",
      status: 503,
    };
  }
  const validated = validateChatUploadInput(
    input.originalFileName,
    input.sizeBytes,
    input.contentType,
  );
  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400 };
  }

  const payload = {
    storedFileName: input.storedFileName,
    originalFileName: input.originalFileName,
    sizeBytes: input.sizeBytes,
    contentType: validated.contentType,
  };

  if (!shouldUseCrossOriginObjectUrl(request)) {
    if (input.sizeBytes > CHAT_ATTACHMENT_PROXY_MAX_BYTES) {
      return {
        ok: false,
        error: chatAttachmentPreviewTooLargeMessage(input.sizeBytes),
        status: 413,
      };
    }
    const path = proxyUploadPath.trim();
    if (!path.startsWith("/")) {
      return { ok: false, error: "Invalid proxy upload path.", status: 500 };
    }
    return {
      ok: true,
      ticket: createChatAttachmentProxyUploadTicket(payload, path),
    };
  }

  const ticket = await createChatAttachmentUploadTicket(payload);
  return { ok: true, ticket };
}

export async function createChatAttachmentUploadTicket(input: {
  storedFileName: string;
  originalFileName: string;
  sizeBytes: number;
  contentType?: string;
}): Promise<ChatPutUploadTicket | ChatMultipartUploadTicket> {
  await ensureR2BrowserCors();
  assertChatAttachmentUploadAllowed();
  if (selectChatAttachmentStoreKind() !== "s3") {
    throw new Error("Direct-to-storage upload is only available when R2/S3 is configured.");
  }
  const validated = validateChatUploadInput(
    input.originalFileName,
    input.sizeBytes,
    input.contentType,
  );
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  const storedFileName = safeChatStoredFileName(input.storedFileName);
  const r2Key = chatObjectKey(storedFileName);
  const expiresIn = modelUploadUrlTtlSeconds();
  const mode = chatUploadMode(input.sizeBytes);

  if (mode === "put") {
    const command = new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: r2Key,
      ContentType: validated.contentType,
    });
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn });
    return {
      method: "PUT",
      uploadUrl,
      storedFileName,
      r2Key,
      contentType: validated.contentType,
    };
  }

  const create = await getS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: s3Bucket(),
      Key: r2Key,
      ContentType: validated.contentType,
    }),
  );
  const uploadId = create.UploadId;
  if (!uploadId) {
    throw new Error("Could not start multipart upload.");
  }
  const partCount = chatMultipartPartCount(input.sizeBytes);
  const parts: Array<{ partNumber: number; uploadUrl: string }> = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
    const command = new UploadPartCommand({
      Bucket: s3Bucket(),
      Key: r2Key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn });
    parts.push({ partNumber, uploadUrl });
  }
  return {
    method: "multipart",
    uploadId,
    storedFileName,
    r2Key,
    contentType: validated.contentType,
    partSize: CHAT_MULTIPART_PART_BYTES,
    parts,
  };
}

export async function completeChatAttachmentMultipartUpload(input: {
  storedFileName: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}) {
  assertChatAttachmentUploadAllowed();
  const storedFileName = safeChatStoredFileName(input.storedFileName);
  const r2Key = chatObjectKey(storedFileName);
  if (!input.uploadId || !input.parts.length) {
    throw new Error("Multipart completion requires upload parts.");
  }
  const sorted = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
  await getS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: s3Bucket(),
      Key: r2Key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: sorted.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    }),
  );
}

export async function chatAttachmentExists(storedFileName: string): Promise<boolean> {
  if (selectChatAttachmentStoreKind() !== "s3") {
    return false;
  }
  const name = safeChatStoredFileName(storedFileName);
  const key = chatObjectKey(name);
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

export async function chatAttachmentHead(storedFileName: string) {
  const name = safeChatStoredFileName(storedFileName);
  const key = chatObjectKey(name);
  if (testS3Objects) {
    const bytes = testS3Objects.get(key);
    if (!bytes?.length) {
      return null;
    }
    return { sizeBytes: bytes.length, contentType: "application/octet-stream" };
  }
  try {
    const result = await getS3Client().send(
      new HeadObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
      }),
    );
    return {
      sizeBytes: result.ContentLength ?? 0,
      contentType: result.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if (isS3MissingError(error)) {
      return null;
    }
    return null;
  }
}

export async function readChatAttachmentBytes(
  storedFileName: string,
): Promise<Buffer | null> {
  const name = safeChatStoredFileName(storedFileName);
  const key = chatObjectKey(name);
  if (testS3Objects) {
    const bytes = testS3Objects.get(key);
    return bytes ? Buffer.from(bytes) : null;
  }
  if (selectChatAttachmentStoreKind() !== "s3") {
    return null;
  }
  try {
    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
      }),
    );
    if (!result.Body) {
      return null;
    }
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (error) {
    if (isS3MissingError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createChatAttachmentDownloadUrl(
  storedFileName: string,
  expiresInSeconds = modelDownloadUrlTtlSeconds(),
) {
  await ensureR2BrowserCors();
  if (selectChatAttachmentStoreKind() !== "s3") {
    throw new Error("S3 object storage is not configured");
  }
  const name = safeChatStoredFileName(storedFileName);
  const command = new GetObjectCommand({
    Bucket: s3Bucket(),
    Key: chatObjectKey(name),
  });
  const downloadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
  return { downloadUrl, storedFileName: name };
}

export async function writeChatAttachmentForTests(
  storedFileName: string,
  bytes: Buffer,
) {
  const name = safeChatStoredFileName(storedFileName);
  const key = chatObjectKey(name);
  if (testS3Objects) {
    testS3Objects.set(key, Buffer.from(bytes));
    return;
  }
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: bytes,
    }),
  );
}
