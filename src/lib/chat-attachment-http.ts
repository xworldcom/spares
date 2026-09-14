import { rejectDisallowedOrigin, shouldUseCrossOriginObjectUrl } from "./cors.ts";
import {
  CHAT_ATTACHMENT_PROXY_MAX_BYTES,
  chatAttachmentPreviewTooLargeMessage,
  chatObjectKey,
  chatStoredFileName,
  parseActivityAttachments,
  validateChatUploadInput,
} from "./chat-attachments.ts";
import {
  assertChatAttachmentUploadAllowed,
  chatAttachmentExists,
  chatAttachmentHead,
  completeChatAttachmentMultipartUpload,
  createChatAttachmentDownloadUrl,
  planChatAttachmentUpload,
  putChatAttachmentObject,
  selectChatAttachmentStoreKind,
  vercelRequiresChatObjectStorageMessage,
} from "./chat-attachment-storage.ts";
import { error, json } from "./http.ts";
import type { ChatAttachment } from "../types/index.ts";

export function chatUploadAvailability() {
  return json({
    r2Upload: selectChatAttachmentStoreKind() === "s3",
  });
}

export async function handleChatAttachmentUploadPost(
  request: Request,
  originalFileName: string,
  sizeBytes: number,
  contentType?: string,
  proxyUploadPath?: string,
) {
  const originError = rejectDisallowedOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    assertChatAttachmentUploadAllowed();
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : vercelRequiresChatObjectStorageMessage();
    return error(message, 503);
  }

  if (selectChatAttachmentStoreKind() !== "s3") {
    return error(
      "Direct-to-storage upload is only available when R2/S3 is configured.",
      503,
    );
  }

  const validated = validateChatUploadInput(originalFileName, sizeBytes, contentType);
  if (!validated.ok) {
    return error(validated.error, 400);
  }

  const storedFileName = chatStoredFileName(originalFileName);
  const path = proxyUploadPath?.trim();
  if (!path) {
    return error("Proxy upload path is not configured.", 500);
  }
  try {
    const planned = await planChatAttachmentUpload(
      request,
      {
        storedFileName,
        originalFileName,
        sizeBytes,
        contentType: validated.contentType,
      },
      path,
    );
    if (!planned.ok) {
      return error(planned.error, planned.status);
    }
    return json(planned.ticket);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Could not start the attachment upload.";
    return error(message, 400);
  }
}

export async function handleChatAttachmentProxyPost(
  request: Request,
  originalFileName: string,
  sizeBytes: number,
  contentType?: string,
) {
  const originError = rejectDisallowedOrigin(request);
  if (originError) {
    return originError;
  }

  if (shouldUseCrossOriginObjectUrl(request)) {
    return error(
      "Direct-to-storage upload is available on this origin. Use the presigned upload ticket instead.",
      400,
    );
  }

  try {
    assertChatAttachmentUploadAllowed();
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : vercelRequiresChatObjectStorageMessage();
    return error(message, 503);
  }

  if (selectChatAttachmentStoreKind() !== "s3") {
    return error(
      "Direct-to-storage upload is only available when R2/S3 is configured.",
      503,
    );
  }

  const validated = validateChatUploadInput(originalFileName, sizeBytes, contentType);
  if (!validated.ok) {
    return error(validated.error, 400);
  }
  if (sizeBytes > CHAT_ATTACHMENT_PROXY_MAX_BYTES) {
    return error(chatAttachmentPreviewTooLargeMessage(sizeBytes), 413);
  }

  const contentLength = request.headers.get("Content-Length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > CHAT_ATTACHMENT_PROXY_MAX_BYTES) {
      return error(chatAttachmentPreviewTooLargeMessage(parsedLength), 413);
    }
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return error("Could not read the attachment body.", 400);
  }
  if (!body.byteLength) {
    return error("Attachment body is required.", 400);
  }
  if (body.byteLength > CHAT_ATTACHMENT_PROXY_MAX_BYTES) {
    return error(chatAttachmentPreviewTooLargeMessage(body.byteLength), 413);
  }
  if (body.byteLength !== sizeBytes) {
    return error("Attachment size does not match the declared sizeBytes.", 400);
  }

  const storedFileName = chatStoredFileName(originalFileName);
  try {
    await putChatAttachmentObject(
      storedFileName,
      new Uint8Array(body),
      validated.contentType,
    );
    return json({
      ok: true,
      storedFileName,
      r2Key: chatObjectKey(storedFileName),
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Could not store the attachment.";
    return error(message, 400);
  }
}

export function parseChatAttachmentProxyUpload(request: Request) {
  const url = new URL(request.url);
  const originalFileName = url.searchParams.get("originalFileName")?.trim() ?? "";
  const sizeParam = url.searchParams.get("sizeBytes");
  const sizeBytes = sizeParam ? Number(sizeParam) : NaN;
  const contentType = url.searchParams.get("contentType")?.trim() || undefined;
  if (!originalFileName) {
    return { ok: false as const, error: "originalFileName is required.", status: 400 };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false as const, error: "sizeBytes is required.", status: 400 };
  }
  return { ok: true as const, originalFileName, sizeBytes, contentType };
}

export async function handleChatAttachmentCompletePost(
  request: Request,
  body: {
    storedFileName?: string;
    uploadId?: string;
    parts?: Array<{ partNumber?: number; etag?: string }>;
  },
) {
  const originError = rejectDisallowedOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    assertChatAttachmentUploadAllowed();
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : vercelRequiresChatObjectStorageMessage();
    return error(message, 503);
  }

  const storedFileName =
    typeof body.storedFileName === "string" ? body.storedFileName.trim() : "";
  const uploadId = typeof body.uploadId === "string" ? body.uploadId.trim() : "";
  if (!storedFileName || !uploadId) {
    return error("storedFileName and uploadId are required.", 400);
  }
  if (!Array.isArray(body.parts) || body.parts.length === 0) {
    return error("Multipart parts are required.", 400);
  }
  const parts = body.parts
    .map((part) => ({
      partNumber:
        typeof part.partNumber === "number" ? part.partNumber : Number(part.partNumber),
      etag: typeof part.etag === "string" ? part.etag.trim() : "",
    }))
    .filter((part) => Number.isFinite(part.partNumber) && part.partNumber > 0 && part.etag);
  if (!parts.length) {
    return error("Multipart parts are required.", 400);
  }

  try {
    await completeChatAttachmentMultipartUpload({
      storedFileName,
      uploadId,
      parts,
    });
    return json({ ok: true, storedFileName, r2Key: chatObjectKey(storedFileName) });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Could not complete the multipart upload.";
    return error(message, 400);
  }
}

export async function handleChatAttachmentDownloadGet(
  storedFileName: string,
  isReferenced: (storedFileName: string) => boolean,
) {
  if (!isReferenced(storedFileName)) {
    return error("Attachment not found", 404);
  }
  if (!(await chatAttachmentExists(storedFileName))) {
    return error("Attachment not found", 404);
  }
  try {
    const { downloadUrl } = await createChatAttachmentDownloadUrl(storedFileName);
    return Response.redirect(downloadUrl, 302);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Could not open this attachment.";
    return error(message, 503);
  }
}

export async function verifyActivityAttachments(
  attachments: ChatAttachment[],
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!attachments.length) {
    return { ok: true };
  }
  if (selectChatAttachmentStoreKind() !== "s3") {
    return {
      ok: false,
      error: "Chat attachments require R2/S3 object storage.",
      status: 503,
    };
  }
  for (const attachment of attachments) {
    const stored = attachment.r2Key.startsWith("chat/")
      ? attachment.r2Key.slice("chat/".length)
      : attachment.r2Key;
    const head = await chatAttachmentHead(stored);
    if (!head) {
      return {
        ok: false,
        error: `Attachment ${attachment.filename} was not uploaded.`,
        status: 400,
      };
    }
    if (head.sizeBytes > 0 && head.sizeBytes !== attachment.sizeBytes) {
      return {
        ok: false,
        error: `Attachment ${attachment.filename} size does not match the uploaded file.`,
        status: 400,
      };
    }
  }
  return { ok: true };
}

export function parseUploadJsonBody(body: {
  originalFileName?: unknown;
  sizeBytes?: unknown;
  contentType?: unknown;
}) {
  const originalFileName =
    typeof body.originalFileName === "string" ? body.originalFileName.trim() : "";
  const sizeBytes =
    typeof body.sizeBytes === "number" ? body.sizeBytes : Number(body.sizeBytes);
  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : undefined;
  if (!originalFileName) {
    return { ok: false as const, error: "originalFileName is required.", status: 400 };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false as const, error: "sizeBytes is required.", status: 400 };
  }
  return { ok: true as const, originalFileName, sizeBytes, contentType };
}

export { parseActivityAttachments };
