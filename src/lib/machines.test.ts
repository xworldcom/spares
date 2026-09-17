import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findMachineByNameAtSite,
  machineHasModel,
  machineNameKey,
  normalizeMachineName,
  toMachineDetail,
  toMachineSummary,
} from "./machines.ts";
import { parseModelLessMachineBody } from "./machine-create.ts";
import type { StoredMachine } from "./store.ts";

const machine = {
  id: "m1",
  name: "Press",
  storedFileName: "m1.gltf",
  originalFileName: "press.gltf",
  parts: [{ id: "PN-100", name: "Pump", meshName: "PN-100", qty: 2 }],
  unmatched: [{ source: "list", id: "PN-200", name: "Gasket", qty: 1 }],
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies StoredMachine;

describe("toMachineDetail", () => {
  it("includes unmatched for staff and omits the field for customers", () => {
    const staff = toMachineDetail(machine, "https://example.test/file", "staff");
    const customer = toMachineDetail(machine, "https://example.test/file", "customer");

    assert.deepEqual(staff.unmatched, machine.unmatched);
    assert.equal(Object.hasOwn(customer, "unmatched"), false);
    assert.equal(customer.parts[0]?.qty, 2);
    assert.equal(staff.hasModel, true);
    assert.equal(customer.fileUrl, "https://example.test/file");
  });

  it("clears fileUrl when the machine has no stored model", () => {
    const bare: StoredMachine = {
      ...machine,
      storedFileName: "",
      originalFileName: "",
      parts: [],
      unmatched: [],
      oem: "Fanuc",
    };
    const detail = toMachineDetail(bare, "https://example.test/file", "customer");
    assert.equal(detail.hasModel, false);
    assert.equal(detail.fileUrl, "");
    assert.equal(detail.oem, "Fanuc");
  });
});

describe("machine name matching", () => {
  it("collapses spaces and matches a name at one site", () => {
    assert.equal(normalizeMachineName("  Fanuc   R-2000  "), "Fanuc R-2000");
    assert.equal(machineNameKey("FANUC r-2000"), "fanuc r-2000");
    const rows = [
      { id: "a", name: "Fanuc R-2000", siteId: "site-a" },
      { id: "b", name: "Fanuc R-2000", siteId: "site-b" },
    ];
    assert.equal(findMachineByNameAtSite(rows, "fanuc r-2000", "site-a")?.id, "a");
    assert.equal(findMachineByNameAtSite(rows, "fanuc r-2000", "site-b")?.id, "b");
    assert.equal(findMachineByNameAtSite(rows, "Other", "site-a"), null);
  });

  it("treats a blank stored file as no model", () => {
    assert.equal(machineHasModel({ storedFileName: "" }), false);
    assert.equal(machineHasModel({ storedFileName: "line.glb" }), true);
    assert.equal(machineHasModel({ hasModel: false, storedFileName: "line.glb" }), false);
    assert.equal(toMachineSummary({ id: "x", name: "Line", storedFileName: "" }).hasModel, false);
  });
});

describe("parseModelLessMachineBody", () => {
  it("requires a name and site and keeps optional maker notes", () => {
    assert.equal(parseModelLessMachineBody({}).ok, false);
    assert.equal(parseModelLessMachineBody({ name: "Cell 4" }).ok, false);
    const parsed = parseModelLessMachineBody({
      name: "  Cell   4 ",
      siteId: "site-cargill-ftw",
      oem: "Kuka",
    });
    assert.deepEqual(parsed, {
      ok: true,
      value: { name: "Cell 4", siteId: "site-cargill-ftw", oem: "Kuka" },
    });
  });
});
