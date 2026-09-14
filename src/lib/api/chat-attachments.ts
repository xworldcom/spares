import {
  CHAT_ATTACHMENT_STORAGE_CORS_MESSAGE,
  CHAT_MULTIPART_PART_BYTES,
  isBlockedChatFilename,
  MAX_CHAT_ATTACHMENT_BYTES,
  chatAttachmentOverLimitMessage,
  normalizeChatContentType,
} from "../chat-attachments.ts";
import { ApiError } from "./errors.ts";
import { apiFetch } from "./client.ts";
import type { ChatAttachment } from "@/types";

export type ChatThreadKind = "ticket" | "quote";

type UploadTicketPut = {
  method: "PUT";
  uploadUrl: string;
  storedFileName: string;
  r2Key: string;
  contentType: string;
};

type UploadTicketMultipart = {
  method: "multipart";
  uploadId: string;
  storedFileName: string;
  r2Key: string;
  contentType: string;
  partSize: number;
  parts: Array<{ partNumber: number; uploadUrl: string }>;
};

type UploadTicketProxy = {
  method: "proxy";
  uploadUrl: string;
  storedFileName: string;
  r2Key: string;
  contentType: string;
};

type UploadTicket = UploadTicketPut | UploadTicketMultipart | UploadTicketProxy;

function uploadBase(kind: ChatThreadKind, id: string) {
  return kind === "ticket"
    ? `/api/tickets/${id}/attachments`
    : `/api/quotes/${id}/attachments`;
}

export function validateChatFileClient(file: File) {
  if (isBlockedChatFilename(file.name)) {
    throw new ApiError(`File type is not allowed for chat attachments.`, 400);
  }
  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    throw new ApiError(chatAttachmentOverLimitMessage(file.size), 413);
  }
}

async function requestUploadTicket(
  kind: ChatThreadKind,
  id: string,
  file: File,
): Promise<UploadTicket> {
  return apiFetch<UploadTicket>(`${uploadBase(kind, id)}/upload`, {
    method: "POST",
    body: JSON.stringify({
      originalFileName: file.name,
      sizeBytes: file.size,
      contentType: file.type || undefined,
    }),
  });
}

function isLikelyStorageCorsFailure(cause: unknown) {
  return cause instanceof TypeError && /failed to fetch/i.test(cause.message);
}

async function uploadPut(ticket: UploadTicketPut, file: File) {
  let response: Response;
  try {
    response = await fetch(ticket.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": ticket.contentType },
    });
  } catch (cause) {
    if (isLikelyStorageCorsFailure(cause)) {
      throw new ApiError(CHAT_ATTACHMENT_STORAGE_CORS_MESSAGE, 0);
    }
    throw cause;
  }
  if (!response.ok) {
    throw new Error(`Could not upload the attachment to storage (${response.status}).`);
  }
}

async function uploadProxy(ticket: UploadTicketProxy, file: File) {
  const url = new URL(ticket.uploadUrl, window.location.origin);
  url.searchParams.set("originalFileName", file.name);
  url.searchParams.set("sizeBytes", String(file.size));
  if (ticket.contentType) {
    url.searchParams.set("contentType", ticket.contentType);
  }
  await apiFetch(url.pathname + url.search, {
    method: "POST",
    headers: { "Content-Type": ticket.contentType || "application/octet-stream" },
    body: file,
  });
}

async function uploadMultipart(
  kind: ChatThreadKind,
  id: string,
  ticket: UploadTicketMultipart,
  file: File,
) {
  const parts: Array<{ partNumber: number; etag: string }> = [];
  for (const part of ticket.parts) {
    const start = (part.partNumber - 1) * ticket.partSize;
    const end = Math.min(start + ticket.partSize, file.size);
    const chunk = file.slice(start, end);
    let response: Response;
    try {
      response = await fetch(part.uploadUrl, {
        method: "PUT",
        body: chunk,
      });
    } catch (cause) {
      if (isLikelyStorageCorsFailure(cause)) {
        throw new ApiError(CHAT_ATTACHMENT_STORAGE_CORS_MESSAGE, 0);
      }
      throw cause;
    }
    if (!response.ok) {
      throw new Error(`Could not upload part ${part.partNumber} (${response.status}).`);
    }
    const etag = response.headers.get("ETag") ?? response.headers.get("etag");
    if (!etag) {
      throw new Error(`Missing ETag for part ${part.partNumber}.`);
    }
    parts.push({ partNumber: part.partNumber, etag });
  }
  await apiFetch(`${uploadBase(kind, id)}/complete`, {
    method: "POST",
    body: JSON.stringify({
      storedFileName: ticket.storedFileName,
      uploadId: ticket.uploadId,
      parts,
    }),
  });
}

export type ChatUploadProgress = {
  loaded: number;
  total: number;
};

export async function uploadChatAttachment(
  kind: ChatThreadKind,
  id: string,
  file: File,
  onProgress?: (progress: ChatUploadProgress) => void,
): Promise<ChatAttachment> {
  validateChatFileClient(file);
  onProgress?.({ loaded: 0, total: file.size });

  const availability = await apiFetch<{ r2Upload?: boolean }>(
    `${uploadBase(kind, id)}/upload`,
  );
  if (!availability.r2Upload) {
    throw new ApiError(
      "Chat attachments require object storage. Contact support if this persists.",
      503,
    );
  }

  const ticket = await requestUploadTicket(kind, id, file);
  if (ticket.method === "proxy") {
    await uploadProxy(ticket, file);
    onProgress?.({ loaded: file.size, total: file.size });
  } else if (ticket.method === "PUT") {
    await uploadPut(ticket, file);
    onProgress?.({ loaded: file.size, total: file.size });
  } else {
    await uploadMultipart(kind, id, ticket, file);
    onProgress?.({ loaded: file.size, total: file.size });
  }

  const contentType = normalizeChatContentType(file.name, ticket.contentType);
  return {
    id: crypto.randomUUID(),
    filename: file.name,
    contentType,
    sizeBytes: file.size,
    r2Key: ticket.r2Key,
    createdAt: new Date().toISOString(),
  };
}

export function chatAttachmentUrl(
  kind: ChatThreadKind,
  threadId: string,
  storedFileName: string,
) {
  const key = storedFileName.startsWith("chat/") ? storedFileName.slice(5) : storedFileName;
  return `${uploadBase(kind, threadId)}/${key}`;
}

export function formatChatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

export { CHAT_MULTIPART_PART_BYTES };
