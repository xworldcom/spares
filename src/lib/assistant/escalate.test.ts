import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { userAskedForAssistant, userAskedToEscalate } from "./escalate.ts";

describe("userAskedToEscalate", () => {
  it("matches common handoff phrases", () => {
    assert.equal(userAskedToEscalate("escalate to staff"), true);
    assert.equal(userAskedToEscalate("I need a technician"), true);
    assert.equal(userAskedToEscalate("this isn't helping"), true);
    assert.equal(userAskedToEscalate("get me a human"), true);
  });

  it("ignores ordinary troubleshooting", () => {
    assert.equal(userAskedToEscalate("The belt is noisy at 40 Hz"), false);
    assert.equal(userAskedToEscalate(""), false);
  });
});

describe("userAskedForAssistant", () => {
  it("matches @AI and hey AI", () => {
    assert.equal(userAskedForAssistant("@AI what is this part?"), true);
    assert.equal(userAskedForAssistant("hey AI, look at the photo"), true);
    assert.equal(userAskedForAssistant("Need a price on the roller"), false);
  });
});
