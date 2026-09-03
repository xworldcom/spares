import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toMachineDetail } from "./machines.ts";
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
  });
});
