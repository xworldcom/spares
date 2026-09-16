import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEMO_DURATION_MS,
  DEMO_PLANT,
  DEMO_SCRIPT,
  demoClockElapsed,
  demoOtherLabel,
  demoSelf,
  marketingCopyBan,
  reduceDemoClock,
} from "./landing-demo.ts";

const MARKETING_FILES = [
  "src/components/landing/LandingMarketing.tsx",
  "src/components/landing/LandingProductDemo.tsx",
  "src/components/landing/LandingScreen.tsx",
  "src/components/landing/LandingScrollPeek.tsx",
  "src/components/landing/LandingCell.tsx",
];

describe("reduceDemoClock", () => {
  it("starts on an open ticket, a requested quote, and the plant's first note", () => {
    const state = reduceDemoClock(DEMO_SCRIPT, 0, "customer");
    assert.equal(state.ticketStatus, "open");
    assert.equal(state.quoteStatus, "requested");
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0]?.kind, "message");
  });

  it("puts plant messages on the right for the customer", () => {
    const state = reduceDemoClock(DEMO_SCRIPT, 400, "customer");
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0]?.kind, "message");
    if (state.rows[0]?.kind === "message") {
      assert.equal(state.rows[0].lane, "own");
    }
  });

  it("flips chat lanes when the viewer is staff", () => {
    const customer = reduceDemoClock(DEMO_SCRIPT, 400, "customer");
    const staff = reduceDemoClock(DEMO_SCRIPT, 400, "staff");
    assert.equal(customer.rows[0]?.kind, "message");
    assert.equal(staff.rows[0]?.kind, "message");
    if (customer.rows[0]?.kind === "message" && staff.rows[0]?.kind === "message") {
      assert.equal(customer.rows[0].lane, "own");
      assert.equal(staff.rows[0].lane, "other");
    }
  });

  it("advances both strips and keeps system chips out of chat lanes", () => {
    const state = reduceDemoClock(DEMO_SCRIPT, DEMO_DURATION_MS, "staff");
    assert.equal(state.ticketStatus, "in_progress");
    assert.equal(state.quoteStatus, "confirmed");
    const chips = state.rows.filter((row) => row.kind === "system");
    const messages = state.rows.filter((row) => row.kind === "message");
    assert.equal(chips.length, 5);
    assert.equal(messages.length, 5);
    assert.ok(chips.every((row) => row.kind === "system"));
  });

  it("uses the product lane helper so self stays on the right", () => {
    assert.deepEqual(demoSelf("customer"), {
      email: "maya@northline-pack.example",
      role: "customer",
    });
    assert.equal(demoOtherLabel("customer"), "Staff");
    assert.equal(demoOtherLabel("staff"), DEMO_PLANT);
  });
});

describe("demoClockElapsed", () => {
  it("holds the finished frame when motion is reduced", () => {
    assert.equal(demoClockElapsed(true, 10), DEMO_DURATION_MS);
    assert.ok(demoClockElapsed(false, 13_200) < DEMO_DURATION_MS + 1400);
  });
});

describe("marketing copy", () => {
  it("keeps Platform and host-admin language out of home marketing", () => {
    for (const file of MARKETING_FILES) {
      const text = readFileSync(file, "utf8");
      assert.equal(marketingCopyBan(text), false, file);
    }
    for (const beat of DEMO_SCRIPT) {
      if ("text" in beat) {
        assert.equal(marketingCopyBan(beat.text), false, beat.id);
      }
    }
    assert.equal(marketingCopyBan("Staff publish machines"), false);
    assert.equal(marketingCopyBan("Hosts publish machines"), true);
    assert.equal(marketingCopyBan("Platform owner reviews inbound"), true);
    assert.equal(marketingCopyBan("Host staff run care"), true);
    assert.equal(marketingCopyBan("multi-tenant ops"), true);
  });
});
