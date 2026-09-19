import type { ChatAttachment } from "../../types/index.ts";
import { chatAttachmentDisplay, chatStoredFileNameFromKey } from "../chat-attachments.ts";
import { readChatAttachmentBytes } from "../chat-attachment-storage.ts";
import { readManualFile } from "../manual-storage.ts";

export const ASSISTANT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const ASSISTANT_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
export const ASSISTANT_FILE_MAX_BYTES = 12 * 1024 * 1024;

export type AssistantFilePart = {
  type: "file";
  mediaType: string;
  filename: string;
  data: Uint8Array;
};

function asUint8(bytes: Buffer): Uint8Array {
  return new Uint8Array(bytes);
}

export async function loadChatMediaParts(
  attachments: readonly ChatAttachment[] | undefined,
): Promise<{ parts: AssistantFilePart[]; notes: string[] }> {
  const parts: AssistantFilePart[] = [];
  const notes: string[] = [];
  for (const attachment of attachments ?? []) {
    const display = chatAttachmentDisplay(attachment.filename, attachment.contentType);
    const stored = chatStoredFileNameFromKey(attachment.r2Key);
    const cap =
      display === "inline-image"
        ? ASSISTANT_IMAGE_MAX_BYTES
        : display === "inline-video"
          ? ASSISTANT_VIDEO_MAX_BYTES
          : ASSISTANT_FILE_MAX_BYTES;
    if (attachment.sizeBytes > cap) {
      notes.push(
        `${attachment.filename} is too large for me to open (${Math.round(attachment.sizeBytes / (1024 * 1024))} MB). Ask for a still photo or a smaller clip if needed.`,
      );
      continue;
    }
    try {
      const bytes = await readChatAttachmentBytes(stored);
      if (!bytes?.length) {
        notes.push(`Could not open ${attachment.filename}.`);
        continue;
      }
      parts.push({
        type: "file",
        mediaType: attachment.contentType,
        filename: attachment.filename,
        data: asUint8(bytes),
      });
    } catch (cause) {
      console.error("assistant media read failed", attachment.filename, cause);
      notes.push(`Could not open ${attachment.filename}.`);
    }
  }
  return { parts, notes };
}

export async function loadManualFilePart(input: {
  storedFileName: string;
  originalFileName: string;
  contentType: string;
  sizeBytes?: number;
}): Promise<{ part?: AssistantFilePart; note?: string }> {
  const size = input.sizeBytes ?? 0;
  if (size > ASSISTANT_FILE_MAX_BYTES) {
    return {
      note: `Manual ${input.originalFileName} is ${Math.round(size / (1024 * 1024))} MB — too large to open in full. Ask the operator for a photo of the relevant page, or escalate.`,
    };
  }
  const bytes = await readManualFile(input.storedFileName);
  if (!bytes?.length) {
    return { note: `Could not read ${input.originalFileName}.` };
  }
  if (bytes.length > ASSISTANT_FILE_MAX_BYTES) {
    return {
      note: `Manual ${input.originalFileName} is too large to open in full.`,
    };
  }
  return {
    part: {
      type: "file",
      mediaType: input.contentType || "application/pdf",
      filename: input.originalFileName,
      data: asUint8(bytes),
    },
  };
}
