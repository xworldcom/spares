import { randomUUID } from "node:crypto";
import type { ChatAttachment } from "../types/index.ts";
import { MODEL_PROXY_MAX_BYTES } from "./pack-limits.ts";

/** ~1 GB per chat attachment (client + server enforced). */
export const MAX_CHAT_ATTACHMENT_BYTES = 1024 * 1024 * 1024;

/** Preview deploys proxy small attachments through Vercel (R2 bucket CORS is Soft Launch only). */
export const CHAT_ATTACHMENT_PROXY_MAX_BYTES = MODEL_PROXY_MAX_BYTES;

/** Use multipart presigned upload above this size. */
export const CHAT_MULTIPART_THRESHOLD_BYTES = 10 * 1024 * 1024;

/** S3/R2 multipart part size (64 MB). */
export const CHAT_MULTIPART_PART_BYTES = 64 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".dmg",
  ".sh",
  ".bash",
  ".ps1",
  ".vbs",
  ".js",
  ".mjs",
  ".cjs",
  ".jar",
  ".app",
  ".scr",
  ".reg",
  ".dll",
  ".so",
  ".deb",
  ".rpm",
]);

const INLINE_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const INLINE_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);

const INLINE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const INLINE_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export type ChatAttachmentDisplay = "inline-image" | "inline-video" | "download";

export function chatAttachmentExtension(filename: string) {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return lower.slice(dot);
}

export function isBlockedChatFilename(filename: string) {
  const ext = chatAttachmentExtension(filename);
  return ext ? BLOCKED_EXTENSIONS.has(ext) : false;
}

export function blockedChatTypeMessage(filename: string) {
  const ext = chatAttachmentExtension(filename);
  return `File type ${ext || "unknown"} is not allowed for chat attachments.`;
}

export function chatAttachmentOverLimitMessage(bytes: number) {
  const gb = bytes / (1024 * 1024 * 1024);
  const shown =
    gb >= 0.1 ? `${Math.round(gb * 10) / 10} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
  return `This file is ${shown}. Chat attachments can be up to 1 GB.`;
}

export function chatAttachmentPreviewTooLargeMessage(bytes: number) {
  const mb = Math.max(1, Math.round(bytes / (1024 * 1024)));
  const limitMb = Math.round(CHAT_ATTACHMENT_PROXY_MAX_BYTES / (1024 * 1024));
  return `This attachment is ${mb} MB. On Vercel Preview, chat uploads can be up to ${limitMb} MB through the app. Use Soft Launch for larger files, or add this Preview origin: node scripts/configure-r2-cors.mjs --add-origin=<your-preview-url>`;
}

/** Shown when a browser PUT to presigned R2 is blocked by bucket CORS. */
export const CHAT_ATTACHMENT_STORAGE_CORS_MESSAGE =
  "Upload blocked (storage CORS). Try Soft Launch or ask Tess to add this Preview origin.";

export function guessChatContentType(filename: string) {
  const ext = chatAttachmentExtension(filename);
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".txt":
      return "text/plain";
    case ".csv":
      return "text/csv";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

export function normalizeChatContentType(filename: string, raw?: string) {
  const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (trimmed && trimmed !== "application/octet-stream") {
    return trimmed;
  }
  return guessChatContentType(filename);
}

export function chatAttachmentDisplay(
  filename: string,
  contentType: string,
): ChatAttachmentDisplay {
  const ext = chatAttachmentExtension(filename);
  const type = contentType.toLowerCase();
  if (INLINE_IMAGE_TYPES.has(type) || INLINE_IMAGE_EXTENSIONS.has(ext)) {
    return "inline-image";
  }
  if (INLINE_VIDEO_TYPES.has(type) || INLINE_VIDEO_EXTENSIONS.has(ext)) {
    return "inline-video";
  }
  return "download";
}

export function validateChatUploadInput(
  originalFileName: string,
  sizeBytes: number,
  contentType?: string,
): { ok: true; contentType: string } | { ok: false; error: string } {
  const filename = originalFileName.trim();
  if (!filename) {
    return { ok: false, error: "File name is required." };
  }
  if (isBlockedChatFilename(filename)) {
    return { ok: false, error: blockedChatTypeMessage(filename) };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "File size is required." };
  }
  if (sizeBytes > MAX_CHAT_ATTACHMENT_BYTES) {
    return { ok: false, error: chatAttachmentOverLimitMessage(sizeBytes) };
  }
  const normalizedType = normalizeChatContentType(filename, contentType);
  if (isBlockedChatFilename(filename)) {
    return { ok: false, error: blockedChatTypeMessage(filename) };
  }
  return { ok: true, contentType: normalizedType };
}

export function chatStoredFileName(originalFileName: string) {
  const ext = chatAttachmentExtension(originalFileName) || "";
  return `chat-${randomUUID()}${ext}`;
}

export function chatObjectKey(storedFileName: string) {
  return `chat/${storedFileName}`;
}

export function isChatStoredFileName(value: string) {
  return /^chat-[0-9a-f-]{36}\.[A-Za-z0-9._-]+$/.test(value) ||
    /^chat-[0-9a-f-]{36}$/.test(value);
}

export function parseChatAttachmentProxyUpload(request: Request) {
  const url = new URL(request.url);
  const originalFileName = url.searchParams.get("originalFileName")?.trim() ?? "";
  const sizeParam = url.searchParams.get("sizeBytes");
  const sizeBytes = sizeParam ? Number(sizeParam) : NaN;
  const contentType = url.searchParams.get("contentType")?.trim() || undefined;
  const storedFileName = url.searchParams.get("storedFileName")?.trim() ?? "";
  if (!originalFileName) {
    return { ok: false as const, error: "originalFileName is required.", status: 400 };
  }
  if (!storedFileName) {
    return { ok: false as const, error: "storedFileName is required.", status: 400 };
  }
  if (!isChatStoredFileName(storedFileName)) {
    return { ok: false as const, error: "storedFileName is invalid.", status: 400 };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false as const, error: "sizeBytes is required.", status: 400 };
  }
  return { ok: true as const, storedFileName, originalFileName, sizeBytes, contentType };
}

export function parseActivityMessageText(
  raw: unknown,
  max: number,
  label = "Message",
): { ok: true; text: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, text: "" };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: `${label} must be text` };
  }
  const text = raw.trim();
  if (text.length > max) {
    return { ok: false, error: `${label} must be ${max} characters or fewer` };
  }
  return { ok: true, text };
}

export function parseActivityAttachments(
  raw: unknown,
): { ok: true; attachments: ChatAttachment[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, attachments: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Attachments must be an array." };
  }
  if (raw.length > 10) {
    return { ok: false, error: "A message can include up to 10 attachments." };
  }
  const attachments: ChatAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid attachment." };
    }
    const record = item as Partial<ChatAttachment>;
    const filename =
      typeof record.filename === "string" ? record.filename.trim() : "";
    const r2Key = typeof record.r2Key === "string" ? record.r2Key.trim() : "";
    const contentType =
      typeof record.contentType === "string" ? record.contentType.trim() : "";
    const sizeBytes =
      typeof record.sizeBytes === "number" ? record.sizeBytes : Number(record.sizeBytes);
    const createdAt =
      typeof record.createdAt === "string" ? record.createdAt.trim() : "";
    if (!filename || !r2Key || !contentType || !createdAt) {
      return { ok: false, error: "Invalid attachment metadata." };
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return { ok: false, error: "Invalid attachment size." };
    }
    if (sizeBytes > MAX_CHAT_ATTACHMENT_BYTES) {
      return { ok: false, error: chatAttachmentOverLimitMessage(sizeBytes) };
    }
    if (isBlockedChatFilename(filename)) {
      return { ok: false, error: blockedChatTypeMessage(filename) };
    }
    const stored = r2Key.startsWith("chat/") ? r2Key.slice("chat/".length) : r2Key;
    if (!isChatStoredFileName(stored)) {
      return { ok: false, error: "Invalid attachment key." };
    }
    attachments.push({
      id: typeof record.id === "string" && record.id ? record.id : randomUUID(),
      filename,
      contentType: normalizeChatContentType(filename, contentType),
      sizeBytes,
      r2Key: chatObjectKey(stored),
      createdAt,
    });
  }
  return { ok: true, attachments };
}

export function parseChatActivityBody(
  raw: { text?: unknown; attachments?: unknown },
  maxText: number,
  label = "Message",
):
  | { ok: true; text: string; attachments: ChatAttachment[] }
  | { ok: false; error: string } {
  const textParsed = parseActivityMessageText(raw.text, maxText, label);
  if (!textParsed.ok) {
    return textParsed;
  }
  const attachmentsParsed = parseActivityAttachments(raw.attachments);
  if (!attachmentsParsed.ok) {
    return attachmentsParsed;
  }
  if (!textParsed.text && attachmentsParsed.attachments.length === 0) {
    return { ok: false, error: `${label} or an attachment is required` };
  }
  return {
    ok: true,
    text: textParsed.text,
    attachments: attachmentsParsed.attachments,
  };
}

export function normalizeChatAttachment(raw: unknown): ChatAttachment | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Partial<ChatAttachment>;
  const filename =
    typeof record.filename === "string" ? record.filename.trim() : "";
  const r2Key = typeof record.r2Key === "string" ? record.r2Key.trim() : "";
  const contentType =
    typeof record.contentType === "string" ? record.contentType.trim() : "";
  const sizeBytes =
    typeof record.sizeBytes === "number" ? record.sizeBytes : NaN;
  const createdAt =
    typeof record.createdAt === "string" ? record.createdAt.trim() : "";
  if (!filename || !r2Key || !contentType || !createdAt) {
    return null;
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return null;
  }
  const stored = r2Key.startsWith("chat/") ? r2Key.slice("chat/".length) : r2Key;
  if (!isChatStoredFileName(stored)) {
    return null;
  }
  return {
    id: typeof record.id === "string" && record.id ? record.id : randomUUID(),
    filename,
    contentType: normalizeChatContentType(filename, contentType),
    sizeBytes,
    r2Key: chatObjectKey(stored),
    createdAt,
  };
}

export function normalizeChatAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(normalizeChatAttachment)
    .filter((row): row is ChatAttachment => row !== null);
}
