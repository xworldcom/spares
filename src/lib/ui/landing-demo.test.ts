import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEMO_ALL_SCRIPT_BEATS,
  DEMO_OTHER_LABEL,
  DEMO_QUOTE_SCRIPT,
  DEMO_TICKET_SCRIPT,
  DEMO_SCRUB_END_HOLD,
  clampDemoScrollProgress,
  demoDocumentScrollProgress,
  demoPlayhead,
  demoSectionScrollProgress,
  marketingCopyBan,
  reduceDemoFrame,
} from "./landing-demo.ts";

const MARKETING_FILES = [
  "src/components/landing/LandingMarketing.tsx",
  "src/components/landing/LandingProductDemo.tsx",
  "src/components/landing/LandingDemoScrub.tsx",
  "src/components/landing/LandingScreen.tsx",
  "src/components/landing/LandingScrollPeek.tsx",
  "src/components/landing/LandingCell.tsx",
];

describe("reduceDemoFrame", () => {
  it("starts the quote demo on requested with the plant's first note", () => {
    const state = reduceDemoFrame("quote", 0);
    assert.equal(state.quoteStatus, "requested");
    assert.equal(state.ticketStatus, "open");
    assert.deepEqual(
      state.rows.map((row) => [row.kind, row.id]),
      [["message", "q-m1"]],
    );
    assert.equal(state.appearingId, "q-m1");
    if (state.rows[0]?.kind === "message") {
      assert.equal(state.rows[0].lane, "own");
      assert.equal(state.rows[0].text, "Need two PN-ROLL-2104 for the palletizer infeed. What's lead time?");
    }
  });

  it("starts the ticket demo on open with the plant's first note", () => {
    const state = reduceDemoFrame("ticket", 0);
    assert.equal(state.ticketStatus, "open");
    assert.deepEqual(
      state.rows.map((row) => [row.kind, row.id]),
      [["message", "t-m1"]],
    );
    if (state.rows[0]?.kind === "message") {
      assert.equal(state.rows[0].lane, "own");
    }
  });

  it("holds the first staff quote reply until a later playhead", () => {
    const early = reduceDemoFrame("quote", 0.2);
    assert.equal(
      early.rows.some((row) => row.kind === "message" && row.id === "q-m2"),
      false,
    );
    assert.equal(early.quoteStatus, "in_review");
    const later = reduceDemoFrame("quote", 0.28);
    assert.equal(
      later.rows.some((row) => row.kind === "message" && row.id === "q-m2"),
      true,
    );
    assert.equal(later.appearingId, "q-m2");
  });

  it("rewinds rows and status when progress drops", () => {
    const forward = reduceDemoFrame("quote", 1);
    assert.equal(forward.quoteStatus, "confirmed");
    assert.equal(forward.rows.filter((row) => row.kind === "message").length, 5);
    assert.equal(forward.rows.filter((row) => row.kind === "system").length, 5);
    const back = reduceDemoFrame("quote", 0);
    assert.equal(back.quoteStatus, "requested");
    assert.equal(back.rows.length, 1);
    assert.equal(back.appearingId, "q-m1");
  });

  it("finishes the ticket thread on resolved", () => {
    const state = reduceDemoFrame("ticket", 1);
    assert.equal(state.ticketStatus, "resolved");
    assert.equal(state.rows.filter((row) => row.kind === "message").length, 5);
    assert.equal(state.appearingId, "t-s5");
  });

  it("keeps plant messages on the right and staff on the left", () => {
    const state = reduceDemoFrame("quote", 0.3);
    const plant = state.rows.find((row) => row.id === "q-m1");
    const staff = state.rows.find((row) => row.id === "q-m2");
    assert.equal(plant && plant.kind === "message" ? plant.lane : null, "own");
    assert.equal(staff && staff.kind === "message" ? staff.lane : "missing", "other");
    assert.equal(DEMO_OTHER_LABEL, "Staff");
  });

  it("updates the featured tree row and clears its unread after staff replies", () => {
    const before = reduceDemoFrame("quote", 0.1);
    const featuredBefore = before.tree.find((row) => row.featured);
    assert.equal(featuredBefore?.number, "4418");
    assert.equal(featuredBefore?.quoteStatus, "requested");
    assert.equal(featuredBefore?.unread, true);
    assert.equal(before.tree.length, 3);
    assert.equal(before.tree[1]?.quoteStatus, "quoted");

    const after = reduceDemoFrame("quote", 0.3);
    const featuredAfter = after.tree.find((row) => row.featured);
    assert.equal(featuredAfter?.unread, false);
    assert.equal(featuredAfter?.quoteStatus, "in_review");
  });

  it("spaces scripted beats so a reply can wait", () => {
    const messages = DEMO_QUOTE_SCRIPT.filter((beat) => beat.kind === "message");
    assert.equal(messages[0]?.at, 0);
    assert.ok((messages[1]?.at ?? 0) >= 0.26);
    const ticketOem = DEMO_TICKET_SCRIPT.find(
      (beat) => beat.kind === "message" && beat.actor === "oem",
    );
    assert.ok((ticketOem?.at ?? 0) >= 0.22);
  });
});

describe("demo scroll scrub", () => {
  it("maps pinned section travel to 0→1 using pin height", () => {
    const pin = 700;
    const extra = 2100;
    const height = pin + extra;
    const sticky = 56;
    const active = extra * (1 - DEMO_SCRUB_END_HOLD);
    assert.equal(demoSectionScrollProgress(sticky, height, pin, sticky), 0);
    assert.equal(demoSectionScrollProgress(sticky - active / 2, height, pin, sticky), 0.5);
    assert.equal(demoSectionScrollProgress(sticky - active, height, pin, sticky), 1);
    assert.equal(demoSectionScrollProgress(sticky - extra, height, pin, sticky), 1);
    assert.equal(clampDemoScrollProgress(1.2), 1);
    assert.equal(clampDemoScrollProgress(-0.1), 0);
  });

  it("holds the finished frame when motion is reduced", () => {
    assert.equal(demoPlayhead(true, 0.2), 1);
    assert.equal(demoPlayhead(false, 0.5), 0.5);
    assert.equal(demoPlayhead(false, 1), 1);
    assert.equal(reduceDemoFrame("quote", demoPlayhead(true, 0)).quoteStatus, "confirmed");
  });

  it("keeps progress on document scroll when the viewport rect is stale", () => {
    const pin = 700;
    const extra = 2100;
    const height = pin + extra;
    const sticky = 56;
    const sectionTop = 900;
    const scrollY = sectionTop - sticky + (extra * (1 - DEMO_SCRUB_END_HOLD)) / 2;
    assert.equal(demoSectionScrollProgress(sectionTop, height, pin, sticky), 0);
    assert.equal(demoDocumentScrollProgress(scrollY, sectionTop, height, pin, sticky), 0.5);
    assert.equal(demoDocumentScrollProgress(0, sectionTop, height, pin, sticky), 0);
  });

  it("reads the playhead from document scroll, not a live client rect", () => {
    const src = readFileSync("src/components/landing/LandingDemoScrub.tsx", "utf8");
    assert.match(src, /demoDocumentScrollProgress/);
    assert.match(src, /flushSync/);
    assert.match(src, /requestAnimationFrame\(tick\)/);
    assert.doesNotMatch(src, /getBoundingClientRect\(\)\.top/);
    assert.doesNotMatch(src, /addEventListener\("scroll"/);
    assert.doesNotMatch(src, /addEventListener\("touchmove"/);
  });
});

describe("landing demo tree visibility", () => {
  it("hides the quote/Care tree below 900px and shows it beside the thread from 900px", () => {
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    const mobile = css.split("@media (max-width: 899px)")[1]?.split("@media")[0] ?? "";
    assert.match(mobile, /\.landing-demo-tree\s*\{[^}]*display:\s*none/);
    const desktop = css.split("@media (min-width: 900px)").at(-1)?.split("@media")[0] ?? "";
    assert.match(desktop, /\.landing-demo-workspace\s*\{[^}]*grid-template-columns/);
    assert.match(desktop, /\.landing-demo-tree\s*\{[^}]*display:\s*flex/);
  });
});

describe("landing scrub layout", () => {
  it("keeps the phone pin a viewport-tall stage so sticky can hold", () => {
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    const mobile = css.split("@media (max-width: 899px)")[1]?.split("@media")[0] ?? "";
    assert.doesNotMatch(mobile, /\.landing-demo-scrub-pin\s*\{[^}]*height:\s*auto/);
    assert.match(css, /\.landing-demo-scrub-pin\s*\{[^}]*100svh/);
    assert.match(css, /var\(--landing-demo-scrub-extra\)/);
    assert.doesNotMatch(css, /280svh/);
    const holdPct = Math.round((1 - DEMO_SCRUB_END_HOLD) * 100);
    assert.match(css, new RegExp(`animation-range:\\s*contain 0% contain ${holdPct}%`));
  });

  it("pins one workspace chapter at a time with a tree and one status strip", () => {
    const marketing = readFileSync("src/components/landing/LandingMarketing.tsx", "utf8");
    assert.equal((marketing.match(/<LandingDemoScrub/g) ?? []).length, 2);
    assert.equal(marketing.includes("LandingDemoPerspective"), false);
    assert.equal(marketing.includes("Staff (OEM)"), false);
    assert.equal(marketing.includes("Flip between"), false);
    assert.equal(marketing.includes("landing-demo-pair"), false);
    const demo = readFileSync("src/components/landing/LandingProductDemo.tsx", "utf8");
    assert.ok(demo.includes("landing-demo-tree"));
    assert.ok(demo.includes("landing-demo-workspace"));
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    assert.ok(css.includes(".landing-demo-stage .imsg-thread.landing-demo-thread[data-scrubbed]"));
    assert.ok(css.includes("overflow-y: hidden"));
    assert.ok(css.includes("var(--spares-header)"));
    assert.equal(css.includes(".landing-perspective"), false);
    assert.ok(css.includes("margin-bottom: calc(0.35rem + env(safe-area-inset-bottom, 0px))"));
    assert.ok(css.includes(".landing-scroll .landing-scroll-peek"));
    const mobile = css.split("@media (max-width: 899px)")[1]?.split("@media")[0] ?? "";
    assert.match(mobile, /\.landing-demo-tree\s*\{[^}]*display:\s*none/);
    assert.match(mobile, /touch-action:\s*pan-y/);
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
