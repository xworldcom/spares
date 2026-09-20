import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMachineStagePath,
  machineContextTabFromPath,
  machineContextTabs,
  machineIdFromPath,
  machineTabHref,
} from "./machine-context.ts";

describe("machine context paths", () => {
  it("reads a machine id and ignores upload", () => {
    assert.equal(machineIdFromPath("/machines/palletizer"), "palletizer");
    assert.equal(machineIdFromPath("/machines/palletizer/care/tickets/t1"), "palletizer");
    assert.equal(machineIdFromPath("/machines/new"), null);
    assert.equal(machineIdFromPath("/quotes/3"), null);
  });

  it("treats only the model page as the immersive stage", () => {
    assert.equal(isMachineStagePath("/machines/palletizer"), true);
    assert.equal(isMachineStagePath("/machines/new"), false);
    assert.equal(isMachineStagePath("/machines/palletizer/quotes"), false);
    assert.equal(isMachineStagePath("/machines/palletizer/care"), false);
  });

  it("maps each machine surface to a tab", () => {
    assert.equal(machineContextTabFromPath("/machines/palletizer"), "model");
    assert.equal(machineContextTabFromPath("/machines/palletizer/quotes"), "quotes");
    assert.equal(machineContextTabFromPath("/machines/palletizer/care"), "overview");
    assert.equal(machineContextTabFromPath("/machines/palletizer/care/tickets/4"), "tickets");
    assert.equal(machineContextTabFromPath("/machines/palletizer/care/manuals"), "manuals");
    assert.equal(machineContextTabFromPath("/machines/palletizer/care/service"), "service");
    assert.equal(machineContextTabFromPath("/machines/palletizer/care/usage"), "service");
    assert.equal(machineContextTabFromPath("/machines/palletizer/unknown"), "overview");
  });

  it("builds stable tab hrefs", () => {
    assert.equal(machineTabHref("m1", "model"), "/machines/m1");
    assert.equal(machineTabHref("m1", "quotes"), "/machines/m1/quotes");
    assert.equal(machineTabHref("m1", "tickets"), "/machines/m1/care/tickets");
    assert.equal(machineTabHref("m1", "service"), "/machines/m1/care/service");
  });

  it("hides Service from customers", () => {
    assert.deepEqual(
      machineContextTabs(false).map((tab) => tab.id),
      ["model", "overview", "quotes", "tickets", "manuals"],
    );
    assert.deepEqual(
      machineContextTabs(true).map((tab) => tab.id),
      ["model", "overview", "quotes", "tickets", "manuals", "service"],
    );
  });
});
