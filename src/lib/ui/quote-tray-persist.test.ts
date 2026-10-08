import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  quoteTrayStorageKey,
  trayLineToPersisted,
  persistedToPart,
} from "./quote-tray-persist.ts";

describe("quote tray persistence", () => {
  it("builds stable storage keys per tenant and machine", () => {
    assert.equal(
      quoteTrayStorageKey("tenant-a", "hardware-fixture"),
      "spares-quote-tray:tenant-a:hardware-fixture",
    );
  });

  it("round-trips manual line snapshots", () => {
    const persisted = trayLineToPersisted(
      {
        id: "5972K325",
        name: "Bearing",
        meshName: "",
        qty: 1,
      },
      2,
    );
    assert.equal(persisted.id, "5972K325");
    assert.equal(persisted.qty, 2);
    const part = persistedToPart(persisted);
    assert.equal(part.id, "5972K325");
    assert.equal(part.name, "Bearing");
  });
});
