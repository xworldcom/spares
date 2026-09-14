"use client";

import {
  chatAttachmentUrl,
  formatChatBytes,
  type ChatThreadKind,
} from "@/lib/api/chat-attachments";
import { chatAttachmentDisplay } from "@/lib/chat-attachments";
import type { ChatAttachment } from "@/types";

function storedNameFromKey(r2Key: string) {
  return r2Key.startsWith("chat/") ? r2Key.slice("chat/".length) : r2Key;
}

export function ChatAttachmentView({
  attachment,
  threadKind,
  threadId,
}: {
  attachment: ChatAttachment;
  threadKind: ChatThreadKind;
  threadId: string;
}) {
  const display = chatAttachmentDisplay(attachment.filename, attachment.contentType);
  const href = chatAttachmentUrl(
    threadKind,
    threadId,
    storedNameFromKey(attachment.r2Key),
  );
  const meta = `${formatChatBytes(attachment.sizeBytes)} · ${attachment.filename}`;

  if (display === "inline-image") {
    return (
      <figure className="imsg-attachment imsg-attachment-image">
        <a href={href} target="_blank" rel="noopener noreferrer">
          <img src={href} alt={attachment.filename} loading="lazy" />
        </a>
        <figcaption>{meta}</figcaption>
      </figure>
    );
  }

  if (display === "inline-video") {
    return (
      <figure className="imsg-attachment imsg-attachment-video">
        <video controls preload="metadata" src={href}>
          <a href={href}>Download video</a>
        </video>
        <figcaption>{meta}</figcaption>
      </figure>
    );
  }

  return (
    <a className="imsg-attachment imsg-attachment-download" href={href} download={attachment.filename}>
      <span className="imsg-attachment-icon" aria-hidden="true">↓</span>
      <span className="imsg-attachment-copy">
        <span className="imsg-attachment-name">{attachment.filename}</span>
        <span className="imsg-attachment-meta">{formatChatBytes(attachment.sizeBytes)} · Download</span>
      </span>
    </a>
  );
}
