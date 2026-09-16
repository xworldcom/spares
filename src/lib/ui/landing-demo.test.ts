import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEMO_ALL_SCRIPT_BEATS,
  DEMO_QUOTE_DURATION_MS,
  DEMO_QUOTE_SCRIPT,
  DEMO_TICKET_DURATION_MS,
  DEMO_TICKET_SCRIPT,
  clampDemoScrollProgress,
  demoElapsedFromProgress,
  demoSectionScrollProgress,
  DEMO_PLANT,
  demoOtherLabel,
  demoSelf,
  marketingCopyBan,
  reduceDemoClock,
} from "./landing-demo.ts";

const MARKETING_FILES = [
  "src/components/landing/LandingMarketing.tsx",
  "src/components/landing/LandingProductDemo.tsx",
  "src/components/landing/LandingDemoPerspective.tsx",
  "src/components/landing/LandingDemoScrub.tsx",
  "src/components/landing/LandingScreen.tsx",
  "src/components/landing/LandingScrollPeek.tsx",
  "src/components/landing/LandingCell.tsx",
];

describe("reduceDemoClock", () => {
  it("starts the quote demo on requested with the plant's first note", () => {
    const state = reduceDemoClock(DEMO_QUOTE_SCRIPT, 0, "customer");
    assert.equal(state.quoteStatus, "requested");
    assert.equal(state.ticketStatus, "open");
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0]?.kind, "message");
  });

  it("starts the ticket demo on open with the plant's first note", () => {
    const state = reduceDemoClock(DEMO_TICKET_SCRIPT, 0, "customer");
    assert.equal(state.ticketStatus, "open");
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0]?.kind, "message");
  });

  it("puts plant messages on the right for the customer", () => {
    const state = reduceDemoClock(DEMO_TICKET_SCRIPT, 400, "customer");
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0]?.kind, "message");
    if (state.rows[0]?.kind === "message") {
      assert.equal(state.rows[0].lane, "own");
    }
  });

  it("flips chat lanes when the viewer is staff", () => {
    const customer = reduceDemoClock(DEMO_TICKET_SCRIPT, 400, "customer");
    const staff = reduceDemoClock(DEMO_TICKET_SCRIPT, 400, "staff");
    assert.equal(customer.rows[0]?.kind, "message");
    assert.equal(staff.rows[0]?.kind, "message");
    if (customer.rows[0]?.kind === "message" && staff.rows[0]?.kind === "message") {
      assert.equal(customer.rows[0].lane, "own");
      assert.equal(staff.rows[0].lane, "other");
    }
  });

  it("advances the quote strip through confirmed and keeps system chips separate", () => {
    const state = reduceDemoClock(DEMO_QUOTE_SCRIPT, DEMO_QUOTE_DURATION_MS, "staff");
    assert.equal(state.quoteStatus, "confirmed");
    const chips = state.rows.filter((row) => row.kind === "system");
    const messages = state.rows.filter((row) => row.kind === "message");
    assert.equal(chips.length, 5);
    assert.equal(messages.length, 5);
    assert.ok(chips.every((row) => row.kind === "system"));
  });

  it("advances the ticket strip to resolved", () => {
    const state = reduceDemoClock(DEMO_TICKET_SCRIPT, DEMO_TICKET_DURATION_MS, "staff");
    assert.equal(state.ticketStatus, "resolved");
    assert.equal(state.rows.filter((row) => row.kind === "message").length, 5);
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

describe("demo scroll scrub", () => {
  it("maps section scroll to 0→1 progress", () => {
    const vh = 800;
    const height = 800 + 1200;
    assert.equal(demoSectionScrollProgress(0, height, vh), 0);
    assert.equal(demoSectionScrollProgress(-1200, height, vh), 1);
    assert.equal(demoSectionScrollProgress(-600, height, vh), 0.5);
    assert.equal(clampDemoScrollProgress(1.2), 1);
    assert.equal(clampDemoScrollProgress(-0.1), 0);
  });

  it("holds the finished frame when motion is reduced", () => {
    assert.equal(
      demoElapsedFromProgress(true, 0.2, DEMO_QUOTE_DURATION_MS),
      DEMO_QUOTE_DURATION_MS,
    );
    assert.equal(
      demoElapsedFromProgress(false, 0.5, DEMO_QUOTE_DURATION_MS),
      DEMO_QUOTE_DURATION_MS / 2,
    );
    assert.equal(
      demoElapsedFromProgress(false, 1, DEMO_TICKET_DURATION_MS),
      DEMO_TICKET_DURATION_MS,
    );
  });
});

describe("landing scrub layout", () => {
  it("pins one demo chapter at a time with a single progress strip each", () => {
    const marketing = readFileSync("src/components/landing/LandingMarketing.tsx", "utf8");
    assert.equal((marketing.match(/<LandingDemoScrub/g) ?? []).length, 2);
    assert.equal(marketing.includes("landing-demo-pair"), false);
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    assert.ok(css.includes(".landing-demo-stage .imsg-thread.landing-demo-thread[data-scrubbed]"));
    assert.ok(css.includes("overflow-y: hidden"));
  });
});

describe("marketing copy", () => {
  it("keeps Platform and host-admin language out of home marketing", () => {
    for (const file of MARKETING_FILES) {
      const text = readFileSync(file, "utf8");
      assert.equal(marketingCopyBan(text), false, file);
    }
    for (const beat of DEMO_ALL_SCRIPT_BEATS) {
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
