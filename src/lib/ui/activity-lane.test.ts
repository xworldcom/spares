import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityLane, sameMessageAuthor } from "./activity-lane.ts";

const staff = { email: "staff@spares.local", role: "staff" as const };
const customer = { email: "customer@spares.local", role: "customer" as const };

const staffNote = {
  kind: "message" as const,
  actorEmail: staff.email,
  actorRole: staff.role,
};
const customerNote = {
  kind: "message" as const,
  actorEmail: customer.email,
  actorRole: customer.role,
};
const statusEvent = {
  kind: "status" as const,
  actorEmail: staff.email,
  actorRole: staff.role,
};

describe("activityLane", () => {
  it("puts the signed-in author's messages on the right from both sides", () => {
    assert.equal(activityLane(staffNote, staff), "own");
    assert.equal(activityLane(customerNote, customer), "own");
  });

  it("puts the other party's messages on the left from both sides", () => {
    assert.equal(activityLane(customerNote, staff), "other");
    assert.equal(activityLane(staffNote, customer), "other");
  });

  it("keeps system events out of chat lanes even when the actor is self", () => {
    assert.equal(activityLane(statusEvent, staff), "system");
    assert.equal(activityLane({ ...statusEvent, kind: "pricing" }, staff), "system");
    assert.equal(activityLane({ ...statusEvent, kind: "po" }, customer), "system");
    assert.equal(activityLane({ ...statusEvent, kind: "shipment" }, customer), "system");
  });

  it("treats the same email on the other role as the other party", () => {
    assert.equal(
      activityLane({ kind: "message", actorEmail: staff.email, actorRole: "customer" }, staff),
      "other",
    );
  });

  it("puts AI messages on the other lane for both roles", () => {
    const aiNote = {
      kind: "message" as const,
      actorEmail: "ai@oee360.local",
      actorRole: "assistant" as const,
    };
    assert.equal(activityLane(aiNote, staff), "other");
    assert.equal(activityLane(aiNote, customer), "other");
  });
});

describe("sameMessageAuthor", () => {
  it("groups consecutive human notes from one identity", () => {
    assert.equal(sameMessageAuthor(staffNote, staffNote), true);
    assert.equal(sameMessageAuthor(staffNote, customerNote), false);
    assert.equal(sameMessageAuthor(staffNote, statusEvent), false);
    assert.equal(sameMessageAuthor(staffNote, undefined), false);
  });
});
