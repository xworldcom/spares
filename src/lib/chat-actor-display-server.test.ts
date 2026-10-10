import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actorDisplayNamesFromUsers } from "./chat-actor-display-server.ts";

describe("actorDisplayNamesFromUsers", () => {
  it("maps message activities without per-email store lookups", () => {
    const map = actorDisplayNamesFromUsers(
      [
        { kind: "status", actorEmail: "staff@demo.com" },
        { kind: "message", actorEmail: "user@demo.com" },
        { kind: "message", actorEmail: "staff@demo.com" },
      ],
      [
        { email: "user@demo.com", name: "Demo buyer" },
        { email: "staff@demo.com", name: "Staff Demo" },
      ],
    );
    assert.equal(map["user@demo.com"], "Demo buyer");
    assert.equal(map["staff@demo.com"], "Staff Demo");
    assert.equal(Object.keys(map).length, 2);
  });
});
