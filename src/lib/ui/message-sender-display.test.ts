import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  messageSenderDisplayName,
  messageSenderInitials,
} from "./message-sender-display.ts";

describe("messageSenderDisplayName", () => {
  it("uses profile name when set", () => {
    assert.equal(
      messageSenderDisplayName({ email: "staff@demo.com", name: "Jamie Cole" }),
      "Jamie Cole",
    );
  });

  it("uses email handle for role-like staff mailboxes", () => {
    assert.equal(messageSenderDisplayName({ email: "staff@demo.com" }), "staff@demo");
    assert.notEqual(messageSenderDisplayName({ email: "staff@demo.com" }), "Staff");
  });

  it("keeps human local-parts as names", () => {
    assert.equal(messageSenderDisplayName({ email: "user@demo.com" }), "User");
  });
});

describe("messageSenderInitials", () => {
  it("derives handle initials for staff@demo.com", () => {
    assert.equal(messageSenderInitials({ email: "staff@demo.com" }), "SD");
  });

  it("derives initials from profile name", () => {
    assert.equal(
      messageSenderInitials({ email: "staff@demo.com", name: "Jamie Cole" }),
      "JC",
    );
  });

  it("keeps user@demo.com as US", () => {
    assert.equal(messageSenderInitials({ email: "user@demo.com" }), "US");
  });

  it("uses profile initials for demo buyer", () => {
    assert.equal(
      messageSenderInitials({ email: "user@demo.com", name: "Demo buyer" }),
      "DB",
    );
  });
});
