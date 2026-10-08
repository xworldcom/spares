import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  partSheetMetaLine,
  partSheetRows,
  partSheetVisible,
  shouldAutoDismissPartSheet,
} from "./part-sheet.ts";

describe("selected-part sheet", () => {
  it("is hidden when nothing is selected so it cannot cover the viewer", () => {
    assert.equal(partSheetVisible(null), false);
    assert.equal(partSheetVisible(undefined), false);
    assert.equal(partSheetVisible(""), false);
    assert.equal(partSheetVisible("PN-FRAME-1000"), true);
  });

  it("auto-dismisses after hide, isolate, and add", () => {
    assert.equal(shouldAutoDismissPartSheet("hide"), true);
    assert.equal(shouldAutoDismissPartSheet("isolate"), true);
    assert.equal(shouldAutoDismissPartSheet("add"), true);
  });
});

describe("part sheet rows", () => {
  it("lists number, description and quantity, and flags a record with nothing more", () => {
    const { rows, extra } = partSheetRows({ id: "PN-1", name: "Drive roller", qty: 2 });
    assert.deepEqual(
      rows.map((row) => [row.label, row.value]),
      [
        ["Part number", "PN-1"],
        ["Description", "Drive roller"],
        ["In this machine", "× 2"],
      ],
    );
    assert.equal(extra, false);
  });

  it("adds only the optional fields that are really there", () => {
    const { rows, extra } = partSheetRows({
      id: "PN-2",
      name: "Bearing",
      qty: 1,
      vendor: " McMaster ",
      material: "",
      replaces: "PN-0",
    });
    assert.deepEqual(
      rows.map((row) => row.label),
      ["Part number", "Description", "In this machine", "Vendor", "Replaces"],
    );
    assert.equal(rows.find((row) => row.label === "Vendor")?.value, "McMaster");
    assert.equal(extra, true);
  });

  it("builds a quiet meta line without inventing values", () => {
    assert.equal(partSheetMetaLine({ id: "A", name: "A", qty: 4 }), "× 4 in machine");
    assert.equal(
      partSheetMetaLine({ id: "A", name: "A", qty: 4, vendor: "Acme", stock: "12" }),
      "× 4 in machine · Acme · stock 12",
    );
    assert.equal(partSheetMetaLine({ id: "A", name: "A" }), "");
  });
});
