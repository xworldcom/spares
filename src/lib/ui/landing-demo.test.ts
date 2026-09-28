import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEMO_ALL_SCRIPT_BEATS,
  DEMO_OTHER_LABEL,
  DEMO_QUOTE_SCRIPT,
  DEMO_SCRUB_EXTRA_SVH,
  DEMO_TICKET_SCRIPT,
  DEMO_SCRUB_END_HOLD,
  clampDemoScrollProgress,
  createDemoScrubStore,
  demoApplyAtVisibility,
  demoDocumentScrollProgress,
  demoFindScrollRoot,
  demoIsNestedScrollPort,
  demoParkedNestedRoot,
  demoPickScrollY,
  demoPinPlacement,
  demoPlayhead,
  demoRowHidden,
  demoScrubDebugEnabled,
  demoSectionScrollProgress,
  demoWorkflowThreadPlayhead,
  marketingCopyBan,
  marketingTutorialCopyBan,
  reduceDemoFrame,
  workflowDemoRollerIndex,
  workflowGuideCue,
  workflowGuideStagePoint,
  workflowHandoffMix,
  workflowHighlightPartId,
  workflowMeshNameMatchesPart,
  workflowHubVisible,
  workflowIntroFade,
  workflowQuoteChatPlayhead,
  workflowScrubPlayhead,
  workflowSpinYaw,
  workflowStep,
  WORKFLOW_DEMO_PART,
  WORKFLOW_FIND_START,
  WORKFLOW_HANDOFF_COMPLETE,
  WORKFLOW_HANDOFF_START,
  WORKFLOW_CHAT_START,
  WORKFLOW_QUOTE_START,
  WORKFLOW_SELECT_ADD,
  WORKFLOW_SELECT_START,
  WORKFLOW_SEND_START,
} from "./landing-demo.ts";

const MARKETING_FILES = [
  "src/components/landing/LandingMarketing.tsx",
  "src/components/landing/LandingProductDemo.tsx",
  "src/components/landing/LandingDemoScrub.tsx",
  "src/components/landing/LandingScreen.tsx",
  "src/components/landing/LandingScrollPeek.tsx",
  "src/components/landing/LandingCell.tsx",
  "src/components/landing/LandingBackToTop.tsx",
  "src/components/landing/LandingWorkflowDemo.tsx",
  "src/components/landing/LandingWorkflowCell.tsx",
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
      assert.equal(state.rows[0].at, 0);
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
    assert.match(src, /demoPickScrollY/);
    assert.match(src, /demoFindScrollRoot/);
    assert.match(src, /demoWorkflowThreadPlayhead/);
    assert.match(src, /useSyncExternalStore/);
    assert.match(src, /requestAnimationFrame\(tick\)/);
    assert.match(src, /data-hydrated/);
    assert.doesNotMatch(src, /flushSync/);
    assert.doesNotMatch(src, /getBoundingClientRect\(\)\.top/);
    assert.doesNotMatch(src, /window\.addEventListener\("scroll"/);
    assert.doesNotMatch(src, /addEventListener\("touchmove"/);
    assert.match(src, /visualViewport\?\.addEventListener\("scroll"/);
    assert.doesNotMatch(src, /demoPickScrollY\(0,/);
  });

  it("picks the scroll root or visual pageTop when window Y is stale", () => {
    assert.equal(demoPickScrollY(0, 0, 0), 0);
    assert.equal(demoPickScrollY(120, 40, 30), 120);
    assert.equal(demoPickScrollY(10, 80, 12), 80);
    assert.equal(demoPickScrollY(10, 10, 64), 64);
    assert.equal(demoPickScrollY(-4, -2, -1), 0);
    assert.equal(demoPickScrollY(0, 80, 200), 200);
    assert.equal(demoParkedNestedRoot(120, 0, 12), true);
    assert.equal(demoParkedNestedRoot(0, 80, 200), true);
    assert.equal(demoParkedNestedRoot(0, 80, 0), false);
    const parkedWindow = demoParkedNestedRoot(120, 0, 12);
    assert.equal(parkedWindow ? demoPickScrollY(120, 0, 12) : 80, 120);
    const parkedVisual = demoParkedNestedRoot(0, 80, 200);
    assert.equal(parkedVisual ? demoPickScrollY(0, 0, 200) : 80, 200);
    const liveNested = demoParkedNestedRoot(0, 80, 0);
    assert.equal(liveNested ? demoPickScrollY(0, 0, 0) : 80, 80);
  });

  it("treats overflow-y auto or scroll as a nested port only when it actually scrolls", () => {
    assert.equal(demoIsNestedScrollPort("auto", 2000, 800), true);
    assert.equal(demoIsNestedScrollPort("scroll", 2000, 800), true);
    assert.equal(demoIsNestedScrollPort("visible", 2000, 800), false);
    assert.equal(demoIsNestedScrollPort("clip", 2000, 800), false);
    assert.equal(demoIsNestedScrollPort("auto", 800, 800), false);
    const root = { id: "app", parent: null as { id: string; parent: null } | null };
    const child = { id: "section", parent: root };
    const found = demoFindScrollRoot(child, (node) => node.parent, (node) => ({
      overflowY: node.id === "app" ? "auto" : "visible",
      scrollHeight: node.id === "app" ? 2400 : 400,
      clientHeight: 800,
    }));
    assert.equal(found?.id, "app");
    assert.equal(
      demoFindScrollRoot(child, (node) => node.parent, () => ({
        overflowY: "visible",
        scrollHeight: 2400,
        clientHeight: 800,
      })),
      null,
    );
  });

  it("pins from document Y, not a live client rect", () => {
    const start = demoPinPlacement(100, 400, 2800, 700, 56);
    assert.deepEqual(start, { phase: "start", position: "absolute", top: 0 });
    const track = demoPinPlacement(800, 400, 2800, 700, 56);
    assert.deepEqual(track, { phase: "track", position: "fixed", top: 56 });
    const end = demoPinPlacement(2600, 400, 2800, 700, 56);
    assert.deepEqual(end, { phase: "end", position: "absolute", top: 2100 });
  });

  it("hides later beats from the playhead without dropping them from the list", () => {
    assert.equal(demoRowHidden(0, 0), false);
    assert.equal(demoRowHidden(0.28, 0.1), true);
    assert.equal(demoRowHidden(0.28, 0.28), false);
    const rows = [
      { hidden: false, dataset: { demoAt: "0" } },
      { hidden: false, dataset: { demoAt: "0.28" } },
    ];
    demoApplyAtVisibility(rows, 0.1);
    assert.equal(rows[0]?.hidden, false);
    assert.equal(rows[1]?.hidden, true);
    demoApplyAtVisibility(rows, 0.3);
    assert.equal(rows[1]?.hidden, false);
  });

  it("keeps the finished-frame store snapshot stable until progress moves", () => {
    const store = createDemoScrubStore();
    const seen: number[] = [];
    const stop = store.subscribe(() => {
      seen.push(store.get().progress);
    });
    store.set({ progress: 0, reduceMotion: false });
    store.set({ progress: 0.4, reduceMotion: false });
    store.set({ progress: 0.4, reduceMotion: false });
    stop();
    assert.deepEqual(seen, [0.4]);
    assert.deepEqual(store.getServer(), { progress: 0, reduceMotion: false });
  });

  it("gates the scrub debug HUD off the production host", () => {
    assert.equal(demoScrubDebugEnabled("oee360.com", "?scrubDebug=1"), false);
    assert.equal(demoScrubDebugEnabled("www.oee360.com", "?scrubDebug=1"), false);
    assert.equal(demoScrubDebugEnabled("spares-220euvxo2-yonder3.vercel.app", "?scrubDebug=1"), true);
    assert.equal(demoScrubDebugEnabled("localhost", ""), false);
    assert.equal(demoScrubDebugEnabled("localhost", "?scrubDebug=0"), false);
  });
});

describe("landing demo tree visibility", () => {
  it("hides the quote/Care tree below 900px and shows it beside the thread from 900px", () => {
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    const mobile = css.split("@media (max-width: 899px)")[1]?.split("@media")[0] ?? "";
    assert.match(mobile, /\.landing-demo-tree\s*\{[^}]*display:\s*none/);
    const desktopChunks = css
      .split("@media (min-width: 900px)")
      .slice(1)
      .map((chunk) => chunk.split("@media")[0] ?? "");
    const desktop =
      desktopChunks.find((chunk) => chunk.includes(".landing-demo-workspace")) ?? "";
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
    assert.match(css, /var\(--landing-demo-scrub-extra,\s*1000svh\)|--landing-demo-scrub-extra:\s*1000svh/);
    assert.equal(DEMO_SCRUB_EXTRA_SVH, 1000);
    assert.doesNotMatch(css, /\.landing-workflow-model-panel\s*\{[^}]*transition:/);
    assert.doesNotMatch(css, /\.landing-workflow-side\s*\{[^}]*transition:/);
    assert.doesNotMatch(css, /\.landing-workflow-request\.is-visible\s*\{[^}]*transition:/);
    const holdPct = Math.round((1 - DEMO_SCRUB_END_HOLD) * 100);
    assert.match(css, new RegExp(`animation-range:\\s*contain 0% contain ${holdPct}%`));
  });

  it("pins one workspace chapter at a time with a tree and one status strip", () => {
    const marketing = readFileSync("src/components/landing/LandingMarketing.tsx", "utf8");
    assert.equal((marketing.match(/<LandingDemoScrub/g) ?? []).length, 1);
    assert.ok(marketing.includes("LandingWorkflowDemo"));
    assert.equal(marketing.includes("LandingDemoPerspective"), false);
    assert.equal(marketing.includes("Staff (OEM)"), false);
    assert.equal(marketing.includes("Flip between"), false);
    assert.equal(marketing.includes("landing-demo-pair"), false);
    const demo = readFileSync("src/components/landing/LandingProductDemo.tsx", "utf8");
    assert.ok(demo.includes("landing-demo-tree"));
    assert.ok(demo.includes("landing-demo-workspace"));
    assert.ok(demo.includes("data-demo-at"));
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    assert.match(css, /overflow-y:\s*visible/);
    assert.ok(css.includes(".landing-demo-stage .imsg-thread.landing-demo-thread[data-scrubbed]"));
    assert.match(
      css,
      /\.landing-demo-stage \.imsg-thread\.landing-demo-thread\[data-scrubbed\]\s*\{[^}]*overflow-y:\s*clip/,
    );
    assert.ok(css.includes("var(--spares-header)"));
    assert.equal(css.includes(".landing-perspective"), false);
    assert.ok(css.includes("margin-bottom: calc(0.35rem + env(safe-area-inset-bottom, 0px))"));
    assert.ok(css.includes(".landing-scroll .landing-scroll-peek"));
    const mobile = css.split("@media (max-width: 899px)")[1]?.split("@media")[0] ?? "";
    assert.match(mobile, /\.landing-demo-tree\s*\{[^}]*display:\s*none/);
    assert.match(mobile, /touch-action:\s*pan-y/);
    assert.match(mobile, /\.landing-demo-scrub-pin\s*\{[^}]*pointer-events:\s*none/);
    assert.match(
      css,
      /@media \(max-width: 899px\)\s*\{\s*\.landing-workflow-part-sheet\s*\{[^}]*bottom:\s*0.75rem/,
    );
    const cinematic = readFileSync("src/app/globals.css", "utf8");
    assert.match(
      cinematic,
      /html:has\(\.spares-app-cinematic\)[\s\S]*overflow-y:\s*visible/,
    );
    assert.match(
      cinematic,
      /html:has\(\.spares-app-cinematic\)[\s\S]*scrollbar-width:\s*none/,
    );
    const critical = readFileSync("src/app/layout.tsx", "utf8");
    assert.match(critical, /\.spares-app-cinematic\{[^}]*overflow-y:visible/);
    assert.match(critical, /html:has\(\.spares-app-cinematic\)[^\{]*\{[^}]*scrollbar-width:none/);
  });
});

describe("landing cell stage", () => {
  it("reuses the machine viewer floor grid in marketing OrbitStage", () => {
    const orbit = readFileSync("src/components/landing/OrbitStage.tsx", "utf8");
    assert.match(orbit, /StudioGround/);
    assert.doesNotMatch(orbit, /<Grid/);
    const ground = readFileSync("src/components/viewer/StudioGround.tsx", "utf8");
    assert.match(ground, /cellColor="#5b6776"/);
    assert.match(ground, /infiniteGrid/);
  });

  it("offers a back-to-top escape once marketing scroll leaves the hero", () => {
    const screen = readFileSync("src/components/landing/LandingScreen.tsx", "utf8");
    assert.match(screen, /LandingBackToTop/);
    const control = readFileSync("src/components/landing/LandingBackToTop.tsx", "utf8");
    assert.match(control, /prefers-reduced-motion/);
    assert.match(control, /scrollTo\(\{ top: 0/);
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    assert.match(css, /\.landing-back-to-top/);
    assert.match(css, /z-index:\s*40/);
  });
});

describe("workflow desktop layout", () => {
  it("keeps the scrub model full-viewport on wide screens instead of a permanent two-column grid", () => {
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    const desktopChunks = css
      .split("@media (min-width: 900px)")
      .slice(1)
      .map((chunk) => chunk.split("@media")[0] ?? "");
    const desktop =
      desktopChunks.find((chunk) => chunk.includes(".landing-demo-stage.landing-workflow")) ?? "";
    assert.doesNotMatch(desktop, /\.landing-workflow-stage\s*\{[^}]*grid-template-columns/);
    assert.match(desktop, /\.landing-demo-stage\.landing-workflow \.landing-workflow-stage\s*\{[^}]*flex:\s*1/);
    assert.match(desktop, /\.landing-demo-stage\.landing-workflow \.landing-workflow-model-panel\s*\{[^}]*inset:\s*0/);
    assert.match(desktop, /\.landing-section--stage \.landing-demo-scrub-stack\s*\{[^}]*100vw/);
  });
});

describe("workflow demo", () => {
  it("dwells on each beat before advancing the visual playhead", () => {
    const order: string[] = [];
    const firstLinear: Partial<Record<string, number>> = {};
    let last = "";
    for (let p = 0; p <= 1.0001; p += 0.002) {
      const step = workflowStep(workflowScrubPlayhead(p));
      if (step !== last) {
        order.push(step);
        firstLinear[step] = p;
        last = step;
      }
    }
    assert.deepEqual(order, ["hub", "find", "select", "quote", "send", "handoff"]);
    assert.equal(workflowScrubPlayhead(0), 0);
    assert.equal(workflowScrubPlayhead(1), 1);
    const handoffAt = firstLinear.handoff ?? 1;
    assert.ok(handoffAt >= 0.44, `handoff ${handoffAt}`);
    assert.ok(handoffAt <= 0.52, `handoff ${handoffAt}`);
    assert.ok(1 - handoffAt >= 0.5);
    assert.ok(workflowGuideCue(WORKFLOW_SELECT_START).target === "hotspot");
    assert.equal(workflowGuideCue(WORKFLOW_SELECT_ADD).target, "add");
    assert.ok(workflowGuideCue(WORKFLOW_SEND_START).target === "request");
    assert.equal(workflowGuideCue(WORKFLOW_HANDOFF_START).target, null);
    const dwell = new Map<string, number>();
    for (let p = 0; p <= 1.0001; p += 0.001) {
      const target = workflowGuideCue(workflowScrubPlayhead(p)).target ?? "none";
      dwell.set(target, (dwell.get(target) ?? 0) + 0.001);
    }
    assert.ok((dwell.get("hotspot") ?? 0) >= 0.05, `hotspot dwell ${dwell.get("hotspot")}`);
    assert.ok((dwell.get("add") ?? 0) >= 0.045, `add dwell ${dwell.get("add")}`);
    assert.ok((dwell.get("request") ?? 0) >= 0.055, `request dwell ${dwell.get("request")}`);
    assert.ok((dwell.get("orbit") ?? 0) >= 0.09, `orbit dwell ${dwell.get("orbit")}`);
    const plateau = (cue: string) => {
      let best = 0;
      let run = 0;
      let prev = -1;
      for (let p = 0; p <= 1.0001; p += 0.001) {
        const visual = workflowScrubPlayhead(p);
        const target = workflowGuideCue(visual).target;
        const flat = Math.abs(visual - prev) < 0.0001;
        if (flat && target === cue) {
          run += 0.001;
          best = Math.max(best, run);
        } else {
          run = 0;
        }
        prev = visual;
      }
      return best;
    };
    const hub = plateau("scroll");
    const orbit = plateau("orbit");
    const quote = plateau("quote");
    const hotspot = plateau("hotspot");
    const add = plateau("add");
    const request = plateau("request");
    assert.ok(hub >= 0.045, `hub plateau ${hub}`);
    assert.ok(orbit >= 0.035, `orbit plateau ${orbit}`);
    assert.ok(quote >= 0.045, `quote plateau ${quote}`);
    assert.ok(hotspot >= 0.035, `hotspot plateau ${hotspot}`);
    assert.ok(add >= 0.035, `add plateau ${add}`);
    assert.ok(request >= 0.045, `request plateau ${request}`);
  });

  it("places the tap cue on the measured hit target, not a guessed stage percent", () => {
    const point = workflowGuideStagePoint(
      { left: 0, top: 0, width: 200, height: 100 },
      { left: 50, top: 20, width: 40, height: 20 },
    );
    assert.deepEqual(point, { x: 35, y: 30 });
    assert.equal(workflowGuideStagePoint({ left: 0, top: 0, width: 0, height: 10 }, { left: 0, top: 0, width: 1, height: 1 }), null);
    const guide = readFileSync("src/components/landing/LandingWorkflowGuide.tsx", "utf8");
    assert.match(guide, /workflowGuideStagePoint/);
    assert.match(guide, /workflowGuideTargetSelector/);
    assert.match(guide, /data-guide=\{shown \? cue\.target : undefined\}/);
    const demo = readFileSync("src/components/landing/LandingWorkflowDemo.tsx", "utf8");
    assert.doesNotMatch(demo, /landing-workflow-model" data-guide-target="orbit"/);
    assert.match(demo, /data-guide-target="orbit"/);
    assert.match(demo, /machineAnchor/);
    assert.match(demo, /guideTarget === "hotspot"/);
    assert.match(demo, /data-guide-target="hotspot"/);
    assert.match(demo, /data-guide-target="add"/);
    assert.match(demo, /data-guide-target="quote"/);
    assert.match(demo, /data-guide-target="request"/);
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    assert.match(
      css,
      /\.landing-workflow-guide-pointer\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\)/,
    );
    assert.doesNotMatch(css, /translate\(-38%/);
    const guideRule = css.match(/\.landing-workflow-guide\s*\{[^}]+\}/)?.[0] ?? "";
    assert.doesNotMatch(guideRule, /transition:/);
  });

  it("keeps the quote roller highlighted on the model from select through the tray", () => {
    assert.equal(workflowHighlightPartId("hub"), null);
    assert.equal(workflowHighlightPartId("find"), null);
    assert.equal(workflowHighlightPartId("select"), WORKFLOW_DEMO_PART);
    assert.equal(workflowHighlightPartId("quote"), WORKFLOW_DEMO_PART);
    assert.equal(workflowHighlightPartId("send"), WORKFLOW_DEMO_PART);
    assert.equal(workflowHighlightPartId("handoff"), null);
    assert.equal(workflowMeshNameMatchesPart("PN-ROLL-2104", WORKFLOW_DEMO_PART), true);
    assert.equal(workflowMeshNameMatchesPart("PN-ROLL-2104_1", WORKFLOW_DEMO_PART), true);
    assert.equal(workflowMeshNameMatchesPart("PN-FRAME-1000", WORKFLOW_DEMO_PART), false);
    const selectPose = [
      { name: "PN-ROLL-2104", x: 0.33, y: 0.85, z: 1.12 },
      { name: "PN-ROLL-2104_1", x: -0.26, y: 0.9, z: -0.8 },
      { name: "PN-MTR-3301", x: 0.3, y: 0.92, z: -1.18 },
      { name: "PN-FRAME-1000", x: 0.04, y: 0.45, z: 0.16 },
    ];
    assert.equal(workflowDemoRollerIndex(selectPose, WORKFLOW_DEMO_PART), 1);
    assert.equal(workflowDemoRollerIndex([], WORKFLOW_DEMO_PART), null);
    const demo = readFileSync("src/components/landing/LandingWorkflowDemo.tsx", "utf8");
    assert.match(demo, /workflowHighlightPartId\(step\)/);
    const orbit = readFileSync("src/components/landing/OrbitStage.tsx", "utf8");
    assert.match(orbit, /highlightPartId/);
    assert.match(orbit, /emissiveIntensity = 0.95/);
    assert.match(orbit, /workflowDemoRollerIndex/);
  });

  it("steps hub → find → select → quote → send → handoff as scroll advances", () => {
    assert.equal(workflowStep(0), "hub");
    assert.equal(workflowStep(WORKFLOW_FIND_START), "find");
    assert.equal(workflowStep(WORKFLOW_SELECT_START), "select");
    assert.equal(workflowStep(WORKFLOW_QUOTE_START), "quote");
    assert.equal(workflowStep(WORKFLOW_SEND_START), "send");
    assert.equal(workflowStep(WORKFLOW_HANDOFF_START), "handoff");
    assert.equal(workflowStep(1), "handoff");
    assert.equal(workflowHandoffMix(WORKFLOW_HANDOFF_START), 0);
    assert.equal(workflowHandoffMix(WORKFLOW_HANDOFF_COMPLETE), 1);
    assert.ok(workflowHandoffMix(1) >= 1);
    assert.equal(workflowQuoteChatPlayhead(WORKFLOW_CHAT_START - 0.01), 0);
    assert.equal(WORKFLOW_CHAT_START, WORKFLOW_HANDOFF_START);
    assert.equal(workflowQuoteChatPlayhead(WORKFLOW_HANDOFF_START), 0);
    assert.equal(workflowQuoteChatPlayhead(1), 1);
    assert.equal(
      demoWorkflowThreadPlayhead(0.9),
      workflowQuoteChatPlayhead(workflowScrubPlayhead(0.9)),
    );
    assert.equal(reduceDemoFrame("quote", workflowQuoteChatPlayhead(1)).quoteStatus, "confirmed");
    const midSpin = workflowSpinYaw((WORKFLOW_FIND_START + WORKFLOW_SELECT_START) / 2);
    const endSpin = workflowSpinYaw(WORKFLOW_SELECT_START);
    assert.ok(midSpin < endSpin);
    assert.ok(endSpin > 1);
    const yaw: number[] = [];
    for (let p = 0; p <= 1.0001; p += 0.001) {
      yaw.push(workflowSpinYaw(workflowScrubPlayhead(Number(p.toFixed(3)))));
    }
    const deltas: number[] = [];
    for (let i = 1; i < yaw.length; i += 1) {
      deltas.push(Math.abs((yaw[i] ?? 0) - (yaw[i - 1] ?? 0)));
    }
    const max = Math.max(...deltas);
    assert.ok(max < (2.4 * Math.PI) / 180, `peak yaw step ${(max * 180) / Math.PI} deg`);
    const moving = deltas.filter((delta) => delta > 0.002);
    assert.ok(moving.length > 20, `moving samples ${moving.length}`);
    const edge = Math.max(moving[0] ?? 0, moving[1] ?? 0, moving.at(-1) ?? 0, moving.at(-2) ?? 0);
    const mid = moving[Math.floor(moving.length / 2)] ?? 0;
    assert.ok(edge < mid * 0.55, `yaw ease edge ${edge} mid ${mid}`);
  });

  it("lets the remapped handoff drive chat row visibility before linear 0.78", () => {
    const linear = 0.7;
    const remapped = workflowScrubPlayhead(linear);
    assert.ok(remapped >= WORKFLOW_HANDOFF_START);
    assert.equal(demoWorkflowThreadPlayhead(linear), workflowQuoteChatPlayhead(remapped));
    assert.ok(demoWorkflowThreadPlayhead(linear) > 0);
    assert.ok(
      reduceDemoFrame("quote", demoWorkflowThreadPlayhead(1)).quoteStatus === "confirmed",
    );
  });

  it("does not reset --wf-handoff on the inner stage so the mix can inherit", () => {
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    assert.doesNotMatch(css, /^\.landing-workflow-stage\s*\{[^}]*--wf-handoff:\s*0/m);
    const demo = readFileSync("src/components/landing/LandingWorkflowDemo.tsx", "utf8");
    assert.match(demo, /"--wf-handoff":/);
  });

  it("keeps quote tray and handoff chrome from capturing iOS pans", () => {
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    assert.match(css, /\.landing-workflow-quote-sheet\s*\{[^}]*pointer-events:\s*none/);
    assert.match(css, /\.landing-workflow-side\s*\{[^}]*pointer-events:\s*none/);
    assert.doesNotMatch(
      css,
      /\.landing-workflow-stage\.is-handoff \.landing-workflow-request\.is-visible\s*\{[^}]*pointer-events:\s*auto/,
    );
    assert.match(css, /\.landing-workflow-stage\s*\{[^}]*overflow:\s*clip/);
    assert.match(
      css,
      /\.landing-workflow-stage \.imsg-thread\.landing-workflow-thread\[data-scrubbed\]\s*\{[^}]*overflow:\s*clip/,
    );
    assert.match(css, /\.landing-workflow-request\s*\{[^}]*overflow:\s*clip/);
  });

  it("drops hub chrome at select so the part sheet does not ghost", () => {
    const demo = readFileSync("src/components/landing/LandingWorkflowDemo.tsx", "utf8");
    assert.match(demo, /workflowHubVisible\(step\)/);
    assert.equal(workflowHubVisible("hub"), true);
    assert.equal(workflowHubVisible("find"), true);
    assert.equal(workflowHubVisible("select"), false);
    assert.equal(workflowHubVisible("quote"), false);
    assert.equal(workflowHubVisible("send"), false);
    assert.equal(workflowHubVisible("handoff"), false);
    assert.ok(workflowIntroFade(0) > 0.9);
    assert.equal(workflowIntroFade(WORKFLOW_SELECT_START), 0);
    const marketing = readFileSync("src/components/landing/LandingMarketing.tsx", "utf8");
    assert.match(marketing, /workflowIntroFade/);
    assert.match(marketing, /introFade > 0\.08/);
  });
});

describe("marketing copy", () => {
  it("keeps tutorial and prompt-sounding language out of home marketing", () => {
    for (const file of MARKETING_FILES) {
      const text = readFileSync(file, "utf8");
      assert.equal(marketingTutorialCopyBan(text), false, file);
    }
  });

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
