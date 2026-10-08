import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  quoteTrayStorageKey,
  trayLineToPersisted,
  persistedToPart,
  mergeHydratedTrayLines,
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

  it("hydrates saved lines and keeps lines added before hydrate", () => {
    const merged = mergeHydratedTrayLines(
      [{ id: "A", name: "Alpha", meshName: "A_1", qty: 2 }],
      [
        { part: { id: "A", name: "Alpha", meshName: "A_1", qty: 1 }, qty: 1 },
        { part: { id: "B", name: "Beta", meshName: "B_1", qty: 1 }, qty: 3 },
      ],
    );
    assert.deepEqual(
      merged.map((line) => [line.part.id, line.qty]),
      [
        ["A", 2],
        ["B", 3],
      ],
    );
  });
});
