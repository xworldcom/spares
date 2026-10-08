import { describe, expect, it } from "vitest";
import { parseBlobCasTelemetry } from "./blob-cas-telemetry.ts";

describe("parseBlobCasTelemetry", () => {
  it("reads counters from platform settings JSON", () => {
    expect(
      parseBlobCasTelemetry({
        phantom412Count: 2,
        phantom412LastAt: "2026-10-08T00:00:00.000Z",
        phantom412LastPath: "catalog/db.json",
      }),
    ).toEqual({
      phantom412Count: 2,
      phantom412LastAt: "2026-10-08T00:00:00.000Z",
      phantom412LastPath: "catalog/db.json",
    });
  });

  it("ignores invalid values", () => {
    expect(parseBlobCasTelemetry({ phantom412Count: -1 })).toEqual({});
  });
});
