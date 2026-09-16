import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { directoryHref, directoryTypeFromSearchParam } from "./directory-url.ts";

describe("directory URL helpers", () => {
  it("parses type filters from search params", () => {
    assert.equal(directoryTypeFromSearchParam(null), "all");
    assert.equal(directoryTypeFromSearchParam("person"), "person");
    assert.equal(directoryTypeFromSearchParam("bogus"), "all");
  });

  it("builds directory hrefs", () => {
    assert.equal(directoryHref("all"), "/staff/directory");
    assert.equal(directoryHref("staff"), "/staff/directory?type=staff");
  });
});
