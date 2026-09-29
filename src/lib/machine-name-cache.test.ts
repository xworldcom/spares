import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readMachineNameCache,
  rememberMachineName,
  seedMachineName,
} from "./machine-name-cache.ts";

describe("machine name cache", () => {
  it("remembers names in memory for the session", () => {
    rememberMachineName("m-1", "North Palletizer");
    assert.equal(readMachineNameCache("m-1"), "North Palletizer");
    seedMachineName("m-2", "Line B");
    assert.equal(readMachineNameCache("m-2"), "Line B");
  });
});
