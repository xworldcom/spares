import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BlobPreconditionFailedError } from "./fake-vercel-blob.ts";
import {
  TicketShardPersistError,
  ticketShardPersistErrorBody,
} from "./ticket-shard-persist.ts";

describe("ticket shard persist errors", () => {
  it("exposes a short public code and blob error name for 503 JSON", () => {
    const err = new TicketShardPersistError("spares/test/ticket.json", new BlobPreconditionFailedError());
    const body = ticketShardPersistErrorBody(err);
    assert.equal(body.code, "TicketShardPersistError");
    assert.equal(body.blobErrorName, "BlobPreconditionFailedError");
    assert.equal(body.blobStatus, undefined);
  });
});
