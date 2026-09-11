import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeDownloadFilename } from "./http.ts";

describe("safeDownloadFilename", () => {
  it("strips paths and header-breaking characters", () => {
    assert.equal(safeDownloadFilename('../../x\r\n"evil.glb'), "x__evil.glb");
    assert.equal(safeDownloadFilename(""), "download");
  });
});
