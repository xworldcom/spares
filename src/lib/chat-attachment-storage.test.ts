import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  chatMultipartPartCount,
  chatUploadMode,
  createChatAttachmentUploadTicket,
  setTestChatS3Objects,
  writeChatAttachmentForTests,
} from "./chat-attachment-storage.ts";

describe("chat-attachment-storage", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-test";
    process.env.S3_ACCESS_KEY_ID = "test-key";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret";
    setTestChatS3Objects(new Map());
  });

  afterEach(() => {
    process.env = { ...env };
    setTestChatS3Objects(null);
  });

  it("chooses PUT for small files and multipart for large files", () => {
    assert.equal(chatUploadMode(1024), "put");
    assert.equal(chatUploadMode(11 * 1024 * 1024), "multipart");
    assert.equal(chatMultipartPartCount(1), 1);
    assert.equal(chatMultipartPartCount(65 * 1024 * 1024), 2);
  });

  it("issues PUT upload tickets for small files", async () => {
    const storedFileName = "chat-550e8400-e29b-41d4-a716-446655440000.png";
    const ticket = await createChatAttachmentUploadTicket({
      storedFileName,
      originalFileName: "photo.png",
      sizeBytes: 4096,
      contentType: "image/png",
    });
    assert.equal(ticket.method, "PUT");
    if (ticket.method === "PUT") {
      assert.match(ticket.uploadUrl, /^https?:\/\//);
      assert.equal(ticket.r2Key, `chat/${storedFileName}`);
    }
  });

  it("plans multipart parts for large files without calling object storage", () => {
    const sizeBytes = 70 * 1024 * 1024;
    assert.equal(chatUploadMode(sizeBytes), "multipart");
    assert.equal(chatMultipartPartCount(sizeBytes), 2);
  });

  it("writes test objects under chat/", async () => {
    const storedFileName = "chat-550e8400-e29b-41d4-a716-446655440000.pdf";
    await writeChatAttachmentForTests(storedFileName, Buffer.from("pdf"));
    const map = new Map<string, Buffer>();
    setTestChatS3Objects(map);
    await writeChatAttachmentForTests(storedFileName, Buffer.from("pdf"));
    assert.ok(map.has(`chat/${storedFileName}`));
  });
});
