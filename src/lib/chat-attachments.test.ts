import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blockedChatTypeMessage,
  chatAttachmentDisplay,
  chatAttachmentOverLimitMessage,
  chatStoredFileName,
  isBlockedChatFilename,
  MAX_CHAT_ATTACHMENT_BYTES,
  parseChatActivityBody,
  validateChatUploadInput,
} from "./chat-attachments.ts";

describe("chat-attachments", () => {
  it("blocks executable and script extensions", () => {
    assert.equal(isBlockedChatFilename("virus.exe"), true);
    assert.equal(isBlockedChatFilename("run.bat"), true);
    assert.equal(isBlockedChatFilename("script.js"), true);
    assert.equal(isBlockedChatFilename("photo.jpg"), false);
    assert.equal(isBlockedChatFilename("spec.pdf"), false);
  });

  it("enforces the 1 GB size limit", () => {
    const over = validateChatUploadInput("big.mp4", MAX_CHAT_ATTACHMENT_BYTES + 1);
    assert.equal(over.ok, false);
    if (!over.ok) {
      assert.match(over.error, /1 GB/);
    }
    const ok = validateChatUploadInput("clip.mp4", 1024);
    assert.equal(ok.ok, true);
  });

  it("classifies inline vs download display modes", () => {
    assert.equal(chatAttachmentDisplay("shot.png", "image/png"), "inline-image");
    assert.equal(chatAttachmentDisplay("clip.mp4", "video/mp4"), "inline-video");
    assert.equal(chatAttachmentDisplay("spec.pdf", "application/pdf"), "download");
  });

  it("parses activity bodies with text, attachments, or both", () => {
    const textOnly = parseChatActivityBody({ text: "Hello" }, 2000);
    assert.equal(textOnly.ok, true);
    if (textOnly.ok) {
      assert.equal(textOnly.text, "Hello");
      assert.equal(textOnly.attachments.length, 0);
    }

    const empty = parseChatActivityBody({ text: "" }, 2000);
    assert.equal(empty.ok, false);

    const withAttachment = parseChatActivityBody(
      {
        text: "",
        attachments: [
          {
            id: "a1",
            filename: "note.pdf",
            contentType: "application/pdf",
            sizeBytes: 1200,
            r2Key: "chat/chat-550e8400-e29b-41d4-a716-446655440000.pdf",
            createdAt: "2026-09-14T00:00:00.000Z",
          },
        ],
      },
      2000,
    );
    assert.equal(withAttachment.ok, true);
    if (withAttachment.ok) {
      assert.equal(withAttachment.attachments.length, 1);
    }

    const blocked = parseChatActivityBody(
      {
        text: "",
        attachments: [
          {
            id: "a1",
            filename: "bad.exe",
            contentType: "application/octet-stream",
            sizeBytes: 10,
            r2Key: "chat/chat-550e8400-e29b-41d4-a716-446655440000.exe",
            createdAt: "2026-09-14T00:00:00.000Z",
          },
        ],
      },
      2000,
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.error, blockedChatTypeMessage("bad.exe"));
    }
  });

  it("builds stored file names under chat/", () => {
    const name = chatStoredFileName("photo.JPG");
    assert.match(name, /^chat-[0-9a-f-]{36}\.jpg$/i);
  });

  it("formats over-limit messages", () => {
    assert.match(chatAttachmentOverLimitMessage(MAX_CHAT_ATTACHMENT_BYTES + 1), /1 GB/);
  });
});
