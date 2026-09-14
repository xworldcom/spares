import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  chatMultipartPartCount,
  chatUploadMode,
  createChatAttachmentProxyUploadTicket,
  createChatAttachmentUploadTicket,
  chatAttachmentHead,
  planChatAttachmentUpload,
  putChatAttachmentObject,
  setTestChatS3Objects,
  writeChatAttachmentForTests,
} from "./chat-attachment-storage.ts";
import { CHAT_ATTACHMENT_PROXY_MAX_BYTES, chatObjectKey } from "./chat-attachments.ts";

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

  it("returns a proxy ticket for Preview origins not on the R2 allowlist", async () => {
    const request = new Request("https://spares-abc123.vercel.app/api/tickets/t1/attachments/upload", {
      headers: { Origin: "https://spares-abc123.vercel.app" },
    });
    const storedFileName = "chat-550e8400-e29b-41d4-a716-446655440000.png";
    const planned = await planChatAttachmentUpload(
      request,
      {
        storedFileName,
        originalFileName: "photo.png",
        sizeBytes: 2048,
        contentType: "image/png",
      },
      "/api/tickets/t1/attachments/proxy",
    );
    assert.equal(planned.ok, true);
    if (planned.ok) {
      assert.equal(planned.ticket.method, "proxy");
      if (planned.ticket.method === "proxy") {
        assert.equal(planned.ticket.uploadUrl, "/api/tickets/t1/attachments/proxy");
      }
    }
  });

  it("refuses large files on Preview with a clear message", async () => {
    const request = new Request("https://spares-abc123.vercel.app/api/tickets/t1/attachments/upload", {
      headers: { Origin: "https://spares-abc123.vercel.app" },
    });
    const planned = await planChatAttachmentUpload(
      request,
      {
        storedFileName: "chat-550e8400-e29b-41d4-a716-446655440000.zip",
        originalFileName: "big.zip",
        sizeBytes: CHAT_ATTACHMENT_PROXY_MAX_BYTES + 1,
        contentType: "application/zip",
      },
      "/api/tickets/t1/attachments/proxy",
    );
    assert.equal(planned.ok, false);
    if (!planned.ok) {
      assert.equal(planned.status, 413);
      assert.match(planned.error, /Soft Launch/);
    }
  });

  it("returns presigned PUT tickets for Soft Launch origins", async () => {
    const request = new Request("https://spares-yonder3.vercel.app/api/tickets/t1/attachments/upload", {
      headers: { Origin: "https://spares-yonder3.vercel.app" },
    });
    const storedFileName = "chat-550e8400-e29b-41d4-a716-446655440000.png";
    const planned = await planChatAttachmentUpload(
      request,
      {
        storedFileName,
        originalFileName: "photo.png",
        sizeBytes: 2048,
        contentType: "image/png",
      },
      "/api/tickets/t1/attachments/proxy",
    );
    assert.equal(planned.ok, true);
    if (planned.ok) {
      assert.equal(planned.ticket.method, "PUT");
    }
  });

  it("plans proxy uploads for preview deploys", () => {
    const storedFileName = "chat-550e8400-e29b-41d4-a716-446655440000.png";
    const ticket = createChatAttachmentProxyUploadTicket(
      {
        storedFileName,
        originalFileName: "photo.png",
        sizeBytes: 4096,
        contentType: "image/png",
      },
      "/api/tickets/t1/attachments/proxy",
    );
    assert.equal(ticket.method, "proxy");
    assert.equal(ticket.uploadUrl, "/api/tickets/t1/attachments/proxy");
    assert.equal(ticket.r2Key, `chat/${storedFileName}`);
  });

  it("plans proxy ticket then stores bytes at the same key for activity validation", async () => {
    const storedFileName = "chat-550e8400-e29b-41d4-a716-446655440001.png";
    const previewOrigin = "https://spares-abc123.vercel.app";
    const request = new Request(`${previewOrigin}/api/tickets/t1/attachments/upload`, {
      headers: { Origin: previewOrigin },
    });
    const planned = await planChatAttachmentUpload(
      request,
      {
        storedFileName,
        originalFileName: "photo.png",
        sizeBytes: 3,
        contentType: "image/png",
      },
      "/api/tickets/t1/attachments/proxy",
    );
    assert.equal(planned.ok, true);
    if (!planned.ok) {
      return;
    }
    assert.equal(planned.ticket.r2Key, chatObjectKey(storedFileName));

    const body = new Uint8Array([9, 8, 7]);
    await putChatAttachmentObject(storedFileName, body, "image/png");
    const head = await chatAttachmentHead(storedFileName);
    assert.ok(head);
    assert.equal(head?.sizeBytes, body.byteLength);
  });

  it("stores proxy upload bytes under chat/", async () => {
    const storedFileName = "chat-550e8400-e29b-41d4-a716-446655440000.png";
    const map = new Map<string, Buffer>();
    setTestChatS3Objects(map);
    await putChatAttachmentObject(
      storedFileName,
      new Uint8Array([1, 2, 3]),
      "image/png",
    );
    assert.ok(map.has(`chat/${storedFileName}`));
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
