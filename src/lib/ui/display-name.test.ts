import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayNameFromEmail } from "./display-name.ts";

describe("displayNameFromEmail", () => {
  it("title-cases dotted and dashed local-parts", () => {
    assert.equal(displayNameFromEmail("jane.doe@cargill.test"), "Jane Doe");
    assert.equal(displayNameFromEmail("ann-marie@example.test"), "Ann Marie");
    assert.equal(displayNameFromEmail("corp@cargill.test"), "Corp");
  });

  it("falls back safely", () => {
    assert.equal(displayNameFromEmail("customer@spares.local"), "Customer");
    assert.equal(displayNameFromEmail("@spares.local"), "@spares.local");
    assert.equal(displayNameFromEmail(""), "Unknown");
  });
});
