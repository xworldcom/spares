import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBlobCasTelemetry } from "./blob-cas-telemetry.ts";

describe("parseBlobCasTelemetry", () => {
  it("reads counters from platform settings JSON", () => {
    assert.deepEqual(
      parseBlobCasTelemetry({
        phantom412Count: 2,
        phantom412LastAt: "2026-10-08T00:00:00.000Z",
        phantom412LastPath: "catalog/db.json",
      }),
      {
        phantom412Count: 2,
        phantom412LastAt: "2026-10-08T00:00:00.000Z",
        phantom412LastPath: "catalog/db.json",
      },
    );
  });

  it("clamps negative counts and ignores non-numbers", () => {
    assert.deepEqual(parseBlobCasTelemetry({ phantom412Count: -1 }), { phantom412Count: 0 });
    assert.deepEqual(parseBlobCasTelemetry({ phantom412Count: "x" }), {});
  });
});
