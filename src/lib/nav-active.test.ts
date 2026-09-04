import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNavActive } from "./nav-active.ts";

const staffHrefs = [
  "/machines",
  "/machines/new",
  "/staff/customers",
  "/staff/quotes",
  "/staff/bugs",
] as const;

function actives(pathname: string) {
  return staffHrefs.filter((href) => isNavActive(pathname, href, staffHrefs));
}

describe("nav active state", () => {
  it("highlights only Upload on /machines/new", () => {
    assert.deepEqual(actives("/machines/new"), ["/machines/new"]);
  });

  it("highlights only Machines on the machines list", () => {
    assert.deepEqual(actives("/machines"), ["/machines"]);
  });

  it("keeps Machines active on a machine page, not Upload", () => {
    assert.deepEqual(actives("/machines/palletizer"), ["/machines"]);
  });

  it("highlights only the matching staff route", () => {
    assert.deepEqual(actives("/staff/quotes"), ["/staff/quotes"]);
    assert.deepEqual(actives("/staff/customers"), ["/staff/customers"]);
    assert.deepEqual(actives("/staff/bugs"), ["/staff/bugs"]);
  });

  it("highlights nothing on unrelated paths", () => {
    assert.deepEqual(actives("/login"), []);
    assert.deepEqual(actives("/"), []);
  });
});
