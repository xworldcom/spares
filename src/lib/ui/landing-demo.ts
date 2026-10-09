import { QUOTE_STATUS_LABELS } from "../quotes.ts";
import type { QuoteStatus, Role, TicketStatus } from "../../types/index.ts";
import type { ActivityLane } from "./activity-lane.ts";

export type LandingDemoVariant = "quote" | "ticket";
export type DemoActor = "plant" | "oem";

export const DEMO_CUSTOMER_EMAIL = "maya@northline-pack.example";
export const DEMO_STAFF_EMAIL = "owen@oee360.example";
export const DEMO_PLANT = "Northline Packing";
export const DEMO_MACHINE = "Palletizer cell";
export const DEMO_TICKET_TITLE = "Infeed jam, drive roller";
export const DEMO_QUOTE_TITLE = "PN-ROLL-2104 × 2";
export const DEMO_OTHER_LABEL = "Staff";

export const DEMO_QUOTE_NUMBER = "4418";
export const DEMO_TICKET_NUMBER = "218";

export const DEMO_SCRUB_EXTRA_SVH = 1000;
/** Phone: one swipe is ~1 viewport, so 1000svh meant ~9 swipes pinned. */
/** ~5–6 phone swipes so one fling does not skip workflow beats. */
export const DEMO_SCRUB_EXTRA_SVH_PHONE = 550;

/** Tall post-pin snap rails — one fling cannot skip a quote-status beat. */
export const DEMO_BEAT_TRACK_SVH = 56;
export const DEMO_BEAT_TRACK_SVH_PHONE = 56;

export const DEMO_SCRUB_END_HOLD = 0.14;

/** Shorter post-Confirmed hold on narrow viewports so one medium swipe can exit. */
export function demoScrubEndHoldFraction(viewportWidth: number) {
  if (viewportWidth <= 360) {
    return 0.042;
  }
  if (viewportWidth <= 420) {
    return 0.055;
  }
  if (viewportWidth <= 640) {
    return 0.09;
  }
  return DEMO_SCRUB_END_HOLD;
}

export type DemoBeat =
  | {
      at: number;
      kind: "message";
      id: string;
      actor: DemoActor;
      text: string;
    }
  | {
      at: number;
      kind: "system";
      id: string;
      text: string;
    }
  | { at: number; kind: "ticketStatus"; status: TicketStatus }
  | { at: number; kind: "quoteStatus"; status: QuoteStatus };

export type DemoMessageRow = {
  kind: "message";
  id: string;
  at: number;
  lane: ActivityLane;
  text: string;
  actorEmail: string;
  actorRole: Role;
  stacked: boolean;
  lastInStack: boolean;
};

export type DemoSystemRow = {
  kind: "system";
  id: string;
  at: number;
  text: string;
};

export type DemoVisibleRow = DemoMessageRow | DemoSystemRow;

export type DemoTreeRow = {
  id: string;
  number: string;
  title: string;
  meta: string;
  featured: boolean;
  quoteStatus?: QuoteStatus;
  ticketStatus?: TicketStatus;
  unread: boolean;
};

export type DemoFrame = {
  ticketStatus: TicketStatus;
  quoteStatus: QuoteStatus;
  rows: DemoVisibleRow[];
  appearingId: string | null;
  tree: DemoTreeRow[];
};

export const DEMO_QUOTE_SCRIPT: readonly DemoBeat[] = [
  { at: 0, kind: "quoteStatus", status: "requested" },
  {
    at: 0,
    kind: "message",
    id: "q-m1",
    actor: "plant",
    text: "Need two PN-ROLL-2104 for the palletizer infeed. What's lead time?",
  },
  { at: 0.08, kind: "system", id: "q-s1", text: "Quote request received" },
  { at: 0.16, kind: "quoteStatus", status: "in_review" },
  {
    at: 0.28,
    kind: "message",
    id: "q-m2",
    actor: "oem",
    text: "Checking stock and freight to your dock.",
  },
  { at: 0.38, kind: "quoteStatus", status: "pricing" },
  { at: 0.4, kind: "system", id: "q-s2", text: "Quote in pricing" },
  {
    at: 0.52,
    kind: "message",
    id: "q-m3",
    actor: "oem",
    text: "Two rollers, Friday dock if you PO today. Sending the formal quote now.",
  },
  { at: 0.62, kind: "quoteStatus", status: "quoted" },
  { at: 0.64, kind: "system", id: "q-s3", text: "Quote ready" },
  {
    at: 0.76,
    kind: "message",
    id: "q-m4",
    actor: "plant",
    text: "PO 4418 is in. Need them on the line Friday.",
  },
  { at: 0.84, kind: "quoteStatus", status: "po_received" },
  { at: 0.86, kind: "system", id: "q-s4", text: "PO received" },
  {
    at: 0.94,
    kind: "message",
    id: "q-m5",
    actor: "oem",
    text: "Confirmed. Parts leave the crib tonight.",
  },
  { at: 0.98, kind: "quoteStatus", status: "confirmed" },
  { at: 1, kind: "system", id: "q-s5", text: "Quote confirmed" },
];

export const DEMO_TICKET_SCRIPT: readonly DemoBeat[] = [
  { at: 0, kind: "ticketStatus", status: "open" },
  {
    at: 0,
    kind: "message",
    id: "t-m1",
    actor: "plant",
    text: "Palletizer jammed on the infeed. Drive roller looks shot.",
  },
  { at: 0.08, kind: "system", id: "t-s1", text: "Care ticket opened" },
  {
    at: 0.24,
    kind: "message",
    id: "t-m2",
    actor: "oem",
    text: "I see it on the cell camera. Logging PN-ROLL-2104 on the BOM.",
  },
  { at: 0.32, kind: "ticketStatus", status: "in_progress" },
  { at: 0.34, kind: "system", id: "t-s2", text: "Ticket → In progress" },
  {
    at: 0.48,
    kind: "message",
    id: "t-m3",
    actor: "oem",
    text: "Replacements are in the crib. Want us to walk your tech through the swap?",
  },
  { at: 0.56, kind: "ticketStatus", status: "waiting_on_customer" },
  { at: 0.58, kind: "system", id: "t-s3", text: "Waiting on plant" },
  {
    at: 0.72,
    kind: "message",
    id: "t-m4",
    actor: "plant",
    text: "We're staffed for it. Send the steps and we'll confirm when we're green.",
  },
  { at: 0.8, kind: "ticketStatus", status: "in_progress" },
  { at: 0.82, kind: "system", id: "t-s4", text: "Ticket → In progress" },
  {
    at: 0.94,
    kind: "message",
    id: "t-m5",
    actor: "oem",
    text: "Steps are in the thread. I'll leave the ticket open until you close it.",
  },
  { at: 0.98, kind: "ticketStatus", status: "resolved" },
  { at: 1, kind: "system", id: "t-s5", text: "Ticket resolved" },
];

const DEMO_QUOTE_TREE_SEED: readonly Omit<DemoTreeRow, "unread" | "quoteStatus">[] = [
  {
    id: "q-featured",
    number: DEMO_QUOTE_NUMBER,
    title: DEMO_MACHINE,
    meta: "Today · 2 lines",
    featured: true,
  },
  {
    id: "q-4401",
    number: "4401",
    title: "Case packer",
    meta: "12 Sep · 4 lines",
    featured: false,
  },
  {
    id: "q-4388",
    number: "4388",
    title: "Wrapper",
    meta: "4 Sep · 1 line",
    featured: false,
  },
];

const DEMO_TICKET_TREE_SEED: readonly Omit<DemoTreeRow, "unread" | "ticketStatus">[] = [
  {
    id: "t-featured",
    number: DEMO_TICKET_NUMBER,
    title: DEMO_TICKET_TITLE,
    meta: "Today · Palletizer cell",
    featured: true,
  },
  {
    id: "t-214",
    number: "214",
    title: "Encoder drift",
    meta: "11 Sep · Case packer",
    featured: false,
  },
  {
    id: "t-209",
    number: "209",
    title: "Lube schedule",
    meta: "2 Sep · Wrapper",
    featured: false,
  },
];

const DEMO_QUOTE_TREE_STATIC: Record<string, QuoteStatus> = {
  "q-4401": "quoted",
  "q-4388": "confirmed",
};

const DEMO_TICKET_TREE_STATIC: Record<string, TicketStatus> = {
  "t-214": "resolved",
  "t-209": "closed",
};

export function demoScript(variant: LandingDemoVariant) {
  return variant === "quote" ? DEMO_QUOTE_SCRIPT : DEMO_TICKET_SCRIPT;
}

export function demoActorEmail(actor: DemoActor) {
  return actor === "plant" ? DEMO_CUSTOMER_EMAIL : DEMO_STAFF_EMAIL;
}

export function demoActorRole(actor: DemoActor): Role {
  return actor === "plant" ? "customer" : "staff";
}

export function clampDemoScrollProgress(progress: number) {
  return Math.min(1, Math.max(0, progress));
}

export function demoPlayhead(reduceMotion: boolean, progress: number) {
  return reduceMotion ? 1 : clampDemoScrollProgress(progress);
}

export function demoSectionScrollProgress(
  sectionTop: number,
  sectionHeight: number,
  pinHeight: number,
  stickyTop = 0,
  viewportWidth = 1280,
) {
  const scrollable = sectionHeight - pinHeight;
  if (scrollable <= 0) {
    return sectionTop <= stickyTop ? 1 : 0;
  }
  const scrolled = stickyTop - sectionTop;
  const raw = clampDemoScrollProgress(scrolled / scrollable);
  const active = 1 - demoScrubEndHoldFraction(viewportWidth);
  if (raw >= active) {
    return 1;
  }
  return raw / active;
}

export function demoDocumentScrollProgress(
  scrollY: number,
  sectionTop: number,
  sectionHeight: number,
  pinHeight: number,
  stickyTop = 0,
) {
  return demoSectionScrollProgress(sectionTop - scrollY, sectionHeight, pinHeight, stickyTop);
}

export function demoPickScrollY(windowY: number, rootY: number, visualPageTop: number) {
  return Math.max(0, windowY, rootY, visualPageTop);
}

/** Nested overflow is a ghost when the window or visual viewport is the live scroll. */
export function demoParkedNestedRoot(windowY: number, rootY: number, visualPageTop = 0) {
  return rootY <= Math.max(windowY, visualPageTop) + 1;
}

export function demoWindowScrollY(windowY: number, documentY: number, bodyY: number, scrollingY: number) {
  return Math.max(0, windowY, documentY, bodyY, scrollingY);
}

export function demoIsNestedScrollPort(overflowY: string, scrollHeight: number, clientHeight: number) {
  return (overflowY === "auto" || overflowY === "scroll") && scrollHeight > clientHeight + 1;
}

export function demoFindScrollRoot<T>(
  from: T,
  parentOf: (node: T) => T | null,
  measure: (node: T) => { overflowY: string; scrollHeight: number; clientHeight: number },
): T | null {
  let node = parentOf(from);
  while (node) {
    const box = measure(node);
    if (demoIsNestedScrollPort(box.overflowY, box.scrollHeight, box.clientHeight)) {
      return node;
    }
    node = parentOf(node);
  }
  return null;
}

export type DemoPinPhase = "start" | "track" | "end";

export type DemoPinPlacement = {
  phase: DemoPinPhase;
  position: "absolute" | "fixed";
  top: number;
};

export function demoPinPlacement(
  scrollY: number,
  sectionTop: number,
  sectionHeight: number,
  pinHeight: number,
  stickyTop: number,
  allowFixed = true,
): DemoPinPlacement {
  const start = sectionTop - stickyTop;
  const travel = Math.max(0, sectionHeight - pinHeight);
  const end = start + travel;
  if (scrollY <= start) {
    return { phase: "start", position: "absolute", top: 0 };
  }
  if (scrollY >= end) {
    return { phase: "end", position: "absolute", top: travel };
  }
  if (!allowFixed) {
    return {
      phase: "track",
      position: "absolute",
      top: Math.min(travel, Math.max(0, scrollY + stickyTop - sectionTop)),
    };
  }
  return { phase: "track", position: "fixed", top: stickyTop };
}

export function demoRowHidden(at: number, playhead: number) {
  return at > playhead;
}

export function demoApplyAtVisibility(
  rows: Iterable<{ hidden: boolean; dataset: { demoAt?: string } }>,
  playhead: number,
) {
  for (const row of rows) {
    const at = Number.parseFloat(row.dataset.demoAt ?? "");
    if (!Number.isFinite(at)) {
      continue;
    }
    row.hidden = demoRowHidden(at, playhead);
  }
}

export type DemoScrubSnapshot = {
  progress: number;
  reduceMotion: boolean;
};

const IDLE_SCRUB: DemoScrubSnapshot = { progress: 0, reduceMotion: false };

export function createDemoScrubStore(initial: DemoScrubSnapshot = IDLE_SCRUB) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(onStoreChange: () => void) {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    get() {
      return snapshot;
    },
    getServer() {
      return IDLE_SCRUB;
    },
    set(next: DemoScrubSnapshot) {
      if (snapshot.progress === next.progress && snapshot.reduceMotion === next.reduceMotion) {
        return;
      }
      snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export function demoScrubDebugEnabled(hostname: string, search: string) {
  if (hostname === "oee360.com" || hostname === "www.oee360.com") {
    return false;
  }
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("scrubDebug") === "1";
}

export function demoOffsetInDocument(el: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let node: Element | null = el; node instanceof HTMLElement; node = node.offsetParent) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y };
}

/** Document Y for an element; stable while the window scrolls (unlike offsetParent when pins go fixed). */
/** Scroll Y that aligns an element's top edge with the sticky pin rail (stable at any page scroll). */
export function demoLandingScrollTargetY(
  pageScrollY: number,
  elementViewportTop: number,
  stickyTop: number,
) {
  return pageScrollY + elementViewportTop - stickyTop;
}

function firstOemAt(beats: readonly DemoBeat[]) {
  return beats.find((beat) => beat.kind === "message" && beat.actor === "oem")?.at ?? 1;
}

function sameDemoAuthor(
  current: Extract<DemoBeat, { kind: "message" }>,
  other?: DemoBeat,
) {
  return Boolean(other && other.kind === "message" && other.actor === current.actor);
}

export function reduceDemoFrame(
  variant: LandingDemoVariant,
  progress: number,
): DemoFrame {
  const beats = demoScript(variant);
  const playhead = clampDemoScrollProgress(progress);
  let ticketStatus: TicketStatus = "open";
  let quoteStatus: QuoteStatus = "requested";
  const visible: Extract<DemoBeat, { kind: "message" | "system" }>[] = [];

  for (const beat of beats) {
    if (beat.at > playhead) {
      continue;
    }
    if (beat.kind === "ticketStatus") {
      ticketStatus = beat.status;
      continue;
    }
    if (beat.kind === "quoteStatus") {
      quoteStatus = beat.status;
      continue;
    }
    visible.push(beat);
  }

  const rows: DemoVisibleRow[] = visible.map((beat, index) => {
    if (beat.kind === "system") {
      return { kind: "system", id: beat.id, at: beat.at, text: beat.text };
    }
    const prev = visible[index - 1];
    const next = visible[index + 1];
    return {
      kind: "message",
      id: beat.id,
      at: beat.at,
      lane: beat.actor === "plant" ? "own" : "other",
      text: beat.text,
      actorEmail: demoActorEmail(beat.actor),
      actorRole: demoActorRole(beat.actor),
      stacked: sameDemoAuthor(beat, prev),
      lastInStack: !sameDemoAuthor(beat, next),
    };
  });

  const unread = playhead < firstOemAt(beats);

  const tree: DemoTreeRow[] =
    variant === "quote"
      ? DEMO_QUOTE_TREE_SEED.map((row) => ({
          ...row,
          quoteStatus: row.featured ? quoteStatus : DEMO_QUOTE_TREE_STATIC[row.id] ?? "quoted",
          unread: row.featured ? unread : false,
        }))
      : DEMO_TICKET_TREE_SEED.map((row) => ({
          ...row,
          ticketStatus: row.featured ? ticketStatus : DEMO_TICKET_TREE_STATIC[row.id] ?? "open",
          unread: row.featured ? unread : false,
        }));

  return {
    ticketStatus,
    quoteStatus,
    rows,
    appearingId: rows.at(-1)?.id ?? null,
    tree,
  };
}

export function marketingCopyBan(text: string) {
  return /\bPlatform\b|\bHosts\b|\bHost staff\b|\bmulti-tenant\b/i.test(text);
}

export type WorkflowStep = "hub" | "find" | "select" | "quote" | "send" | "handoff";

/** Scroll breakpoints for the parts→quote workflow chapter (~6 beats). */
export const WORKFLOW_FIND_START = 0.14;
export const WORKFLOW_SELECT_START = 0.3;
export const WORKFLOW_QUOTE_START = 0.46;
/** Inside select, after the hotspot dwell, the cue sits on Add to quote. */
export const WORKFLOW_SELECT_ADD =
  WORKFLOW_SELECT_START + (WORKFLOW_QUOTE_START - WORKFLOW_SELECT_START) * 0.62;
export const WORKFLOW_SEND_START = 0.62;
export const WORKFLOW_HANDOFF_START = 0.78;
/** Handoff mix reaches 1 — model and tray have cleared the stage. */
export const WORKFLOW_HANDOFF_COMPLETE = 0.86;
/** Quote thread script playhead begins when the thread panel is on stage. */
export const WORKFLOW_CHAT_START = WORKFLOW_HANDOFF_START;

type WorkflowScrubAnchor = { linear: number; visual: number };

const WORKFLOW_SCRUB_MAP: readonly WorkflowScrubAnchor[] = [
  { linear: 0, visual: 0 },
  { linear: 0.05, visual: 0 },
  { linear: 0.07, visual: WORKFLOW_FIND_START },
  { linear: 0.11, visual: WORKFLOW_FIND_START },
  { linear: 0.18, visual: WORKFLOW_SELECT_START },
  { linear: 0.22, visual: WORKFLOW_SELECT_START },
  { linear: 0.245, visual: WORKFLOW_SELECT_ADD },
  { linear: 0.285, visual: WORKFLOW_SELECT_ADD },
  { linear: 0.31, visual: WORKFLOW_QUOTE_START },
  { linear: 0.36, visual: WORKFLOW_QUOTE_START },
  { linear: 0.385, visual: WORKFLOW_SEND_START },
  { linear: 0.435, visual: WORKFLOW_SEND_START },
  { linear: 0.46, visual: WORKFLOW_HANDOFF_START },
  { linear: 0.56, visual: WORKFLOW_HANDOFF_COMPLETE },
  { linear: 1, visual: 1 },
];

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function easeBetweenPlateaus(index: number) {
  const end = WORKFLOW_SCRUB_MAP[index];
  const start = WORKFLOW_SCRUB_MAP[index - 1];
  if (!start || !end || start.visual === end.visual) {
    return false;
  }
  const prev = WORKFLOW_SCRUB_MAP[index - 2];
  const next = WORKFLOW_SCRUB_MAP[index + 1];
  const fromRest = !prev || prev.visual === start.visual;
  const toRest = !next || next.visual === end.visual;
  return fromRest && toRest;
}

/** Script playhead (`at`) for each quote status beat, in story order. */
export function demoQuoteStatusBeatThresholds() {
  const thresholds: number[] = [];
  const seen = new Set<QuoteStatus>();
  for (const beat of DEMO_QUOTE_SCRIPT) {
    if (beat.kind !== "quoteStatus" || seen.has(beat.status)) {
      continue;
    }
    seen.add(beat.status);
    thresholds.push(beat.at);
  }
  return thresholds;
}

/** Plateau share within each equal handoff segment where the beat rests at full opacity. */
export const WORKFLOW_STATUS_BEAT_PLATEAU = 0.1;

export function workflowHandoffLinearStart() {
  return workflowScrubLinearForVisual(WORKFLOW_HANDOFF_START);
}

/** Quote-status beats in story order (handoff chapter). */
export function workflowHandoffBeatStatuses() {
  const statuses: QuoteStatus[] = [];
  const seen = new Set<QuoteStatus>();
  for (const beat of DEMO_QUOTE_SCRIPT) {
    if (beat.kind !== "quoteStatus" || seen.has(beat.status)) {
      continue;
    }
    seen.add(beat.status);
    statuses.push(beat.status);
  }
  return statuses;
}

/** Beat track DOM order index → quote status (geometry source of truth). */
export function workflowHandoffBeatStatusAtIndex(index: number): QuoteStatus {
  const statuses = workflowHandoffBeatStatuses();
  if (statuses.length === 0) {
    return "requested";
  }
  const clamped = Math.min(Math.max(0, index), statuses.length - 1);
  return statuses[clamped]!;
}

export function demoNearestBeatTrackIndex(trackTops: readonly number[], anchorY: number) {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < trackTops.length; i += 1) {
    const dist = Math.abs(trackTops[i]! - anchorY);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Beat track index from pinned-section scroll offset (tracks sit above the pin in document order). */
export function demoBeatTrackIndexFromScroll(
  scrolled: number,
  preHandoffHeight: number,
  beatTrackHeight: number,
  beatCount: number,
) {
  if (beatCount <= 0 || beatTrackHeight <= 0) {
    return 0;
  }
  const raw = demoBeatTrackRawIndexFromScroll(scrolled, preHandoffHeight, beatTrackHeight);
  return Math.min(beatCount - 1, Math.max(0, raw));
}

/** Linear scrub progress when snapped at rest on beat track `index` (no double /active). */
export function demoHandoffLinearProgressAtBeatRest(index: number) {
  return workflowScrubLinearForStatusBeatIndex(index);
}

/** Quote-thread playhead when resting on beat track `index`. */
export function demoThreadPlayheadAtBeatRest(index: number) {
  const thresholds = demoQuoteStatusBeatThresholds();
  const at = thresholds[index];
  return at ?? thresholds.at(-1) ?? 0;
}

export function demoResolveHandoffQuoteStatus(
  nearestTrackIndex: number,
  inBeatChapter: boolean,
  linearProgress: number,
): QuoteStatus {
  if (inBeatChapter) {
    return workflowHandoffBeatStatusAtIndex(nearestTrackIndex);
  }
  return reduceDemoFrame("quote", demoWorkflowThreadPlayhead(linearProgress)).quoteStatus;
}

/**
 * Expected at-rest quote status for beat track `trackIndex` given layout (unit + regression guard).
 */
export function demoQuoteStatusAtBeatTrackRest(
  trackIndex: number,
  layout: {
    preHandoffHeight: number;
    beatTrackHeight: number;
    beatCount: number;
    scrollable: number;
  },
): QuoteStatus {
  const { preHandoffHeight, beatTrackHeight, beatCount, scrollable } = layout;
  const scrolled = preHandoffHeight + trackIndex * beatTrackHeight + beatTrackHeight * 0.42;
  const handoffLinearStart = workflowHandoffLinearStart();
  const linearProgress = demoBeatTrackScrubLinear(
    scrolled,
    scrollable,
    preHandoffHeight,
    beatTrackHeight,
    beatCount,
  );
  const inBeatChapter = beatCount > 0 && scrolled > preHandoffHeight + 8;
  return demoResolveHandoffQuoteStatus(trackIndex, inBeatChapter, linearProgress);
}

/** Pre-handoff scrub snap positions (handoff beats use post-pin tracks). */
export function workflowScrubPreHandoffSnapLinearPositions() {
  const handoffLinear = workflowHandoffLinearStart();
  return workflowScrubSnapLinearPositions().filter((pos) => pos <= handoffLinear + 1e-5);
}

export type WorkflowScrubSnapMarker = {
  linear: number;
  heightDelta: number;
  label: string;
  /** Last marker before handoff beat tracks — stronger snap stop in CSS. */
  handoffEntry: boolean;
};

/**
 * One DOM snap per workflow label before handoff (drops crowded plateau duplicates near Quote tray).
 */
export function workflowScrubPreHandoffSnapRenderMarkers(): WorkflowScrubSnapMarker[] {
  const linear = workflowScrubPreHandoffSnapLinearPositions();
  const markers: WorkflowScrubSnapMarker[] = linear.map((lin, index) => ({
    linear: lin,
    heightDelta: lin - (linear[index - 1] ?? 0),
    label: workflowScrubSnapBeatLabel(lin),
    handoffEntry: false,
  }));
  const filtered = markers.filter((marker, index) => {
    const next = markers[index + 1];
    return !next || next.label !== marker.label;
  });
  if (filtered.length > 0) {
    filtered[filtered.length - 1]!.handoffEntry = true;
  }
  return filtered;
}

/** Height deltas for pre-handoff snap elements (excludes the zero-height origin). */
export function workflowScrubPreHandoffSnapRenderDeltas() {
  return workflowScrubPreHandoffSnapRenderMarkers().slice(1);
}

/** Pixel delta to align a beat track with the sticky pin rail, or null when already aligned. */
export function demoBeatTrackSnapAlignmentDelta(
  trackViewportTop: number,
  stickyTop: number,
  tolerancePx = 14,
): number | null {
  const delta = trackViewportTop - stickyTop;
  if (Math.abs(delta) <= tolerancePx) {
    return null;
  }
  return delta;
}

/**
 * Scroll-end aligner may only run inside the six beat tracks — not the scrub end-hold past Confirmed.
 */
export function demoBeatSnapChapterEnd(
  preHandoffHeight: number,
  beatTrackHeight: number,
  beatCount: number,
) {
  if (beatCount <= 0 || beatTrackHeight <= 0) {
    return preHandoffHeight;
  }
  return preHandoffHeight + (beatCount - 1) * beatTrackHeight + beatTrackHeight * 0.42;
}

/** Beat index to align toward when scroll settles (direction picks floor vs ceil bias). */
export function demoBeatTrackAlignIndexFromScroll(
  scrolled: number,
  preHandoffHeight: number,
  beatTrackHeight: number,
  beatCount: number,
  scrollDirection: -1 | 0 | 1,
) {
  if (beatCount <= 0 || beatTrackHeight <= 0) {
    return 0;
  }
  const trackPix = Math.max(0, scrolled - preHandoffHeight);
  const bias = scrollDirection < 0 ? 0.72 : 0.28;
  const raw = Math.floor((trackPix + beatTrackHeight * bias) / beatTrackHeight);
  return Math.min(beatCount - 1, Math.max(0, raw));
}

/**
 * Alignment delta unless it would scroll opposite the user's last input (scrollDirection 0 = allow).
 */
export type DemoBeatScrollInputKind = "wheel" | "touch" | "keyboard" | "click" | "none";

/** Reject align targets that would undo the user's last beat step. */
export function demoBeatAlignIndexRespectsDirection(
  settledIndex: number,
  targetIndex: number,
  scrollDirection: -1 | 0 | 1,
) {
  if (scrollDirection > 0 && targetIndex < settledIndex) {
    return false;
  }
  if (scrollDirection < 0 && targetIndex > settledIndex) {
    return false;
  }
  return true;
}

export function demoBeatKeyboardStepTargetIndex(
  currentIndex: number,
  direction: -1 | 1,
  beatCount: number,
): number | null {
  if (beatCount <= 0) {
    return null;
  }
  const next = currentIndex + direction;
  if (next < 0 || next >= beatCount) {
    return null;
  }
  return next;
}

export type DemoLandingScrollStopKind =
  | "hero"
  | "preHandoff"
  | "beat"
  | "confirmedHold"
  | "schematic"
  | "assembly"
  | "footer";

export type DemoLandingScrollStop = {
  kind: DemoLandingScrollStopKind;
  scrollY: number;
  beatIndex?: number;
};

/** Scroll Y to align an element's top with the sticky pin rail (stable at any page scroll). */
export function demoLandingStopScrollY(
  pageScrollY: number,
  elementViewportTop: number,
  stickyTop: number,
) {
  return Math.max(0, Math.round(pageScrollY + elementViewportTop - stickyTop));
}

/** Page scroll when the scrub chapter runway ends (Confirmed end-hold), matching pin geometry. */
export function demoLandingScrubChapterEndScrollY(
  sectionDocTop: number,
  sectionHeight: number,
  pinHeight: number,
  stickyTop: number,
) {
  return Math.max(0, Math.round(sectionDocTop + sectionHeight - pinHeight - stickyTop));
}

export type DemoLandingStopBuildInput = {
  pageScrollY: number;
  stickyTop: number;
  viewportWidth: number;
  maxScrollY: number;
  sectionDocTop: number;
  sectionHeight: number;
  pinHeight: number;
  preHandoffViewportTops: readonly number[];
  beatViewportTops: readonly number[];
  beatTrackHeight: number;
  schematicViewportTop: number | null;
  assemblyViewportTop: number | null;
};

/** One stop list: hero → pre-handoff → beats → hold (beat-derived) → schematic → assembly → footer. */
export function demoBuildLandingScrollStops(input: DemoLandingStopBuildInput): DemoLandingScrollStop[] {
  const { pageScrollY, stickyTop } = input;
  const y = (viewportTop: number) => demoLandingStopScrollY(pageScrollY, viewportTop, stickyTop);
  const stops: DemoLandingScrollStop[] = [{ kind: "hero", scrollY: 0 }];

  for (const top of input.preHandoffViewportTops) {
    stops.push({ kind: "preHandoff", scrollY: y(top) });
  }
  input.beatViewportTops.forEach((top, beatIndex) => {
    stops.push({ kind: "beat", beatIndex, scrollY: y(top) });
  });

  if (input.beatViewportTops.length > 0 && input.beatTrackHeight > 0) {
    stops.push({
      kind: "confirmedHold",
      scrollY: demoLandingScrubChapterEndScrollY(
        input.sectionDocTop,
        input.sectionHeight,
        input.pinHeight,
        input.stickyTop,
      ),
    });
  }

  if (input.schematicViewportTop !== null) {
    stops.push({
      kind: "schematic",
      scrollY: Math.min(y(input.schematicViewportTop), input.maxScrollY),
    });
  }
  if (input.assemblyViewportTop !== null) {
    stops.push({
      kind: "assembly",
      scrollY: Math.min(y(input.assemblyViewportTop), input.maxScrollY),
    });
  }

  const merged = demoLandingScrollStopsDedupe(stops);
  merged.push({ kind: "footer", scrollY: input.maxScrollY });
  return merged.sort((a, b) => a.scrollY - b.scrollY);
}

/** Post-chapter stops from document layout (stable while scrolling). */
export function demoBuildLandingPostChapterStops(
  maxScrollY: number,
  schematicScrollY: number | null,
  assemblyScrollY: number | null,
): DemoLandingScrollStop[] {
  const clamp = (y: number) => Math.min(Math.max(0, Math.round(y)), maxScrollY);
  const out: DemoLandingScrollStop[] = [];
  if (schematicScrollY !== null) {
    out.push({
      kind: "schematic",
      scrollY: clamp(schematicScrollY),
    });
  }
  if (assemblyScrollY !== null) {
    out.push({
      kind: "assembly",
      scrollY: clamp(assemblyScrollY),
    });
  }
  out.push({ kind: "footer", scrollY: maxScrollY });
  return out;
}

export function demoMergeLandingScrollStops(
  chapter: readonly DemoLandingScrollStop[],
  postChapter: readonly DemoLandingScrollStop[],
): DemoLandingScrollStop[] {
  const withoutTail = chapter.filter(
    (stop) =>
      stop.kind !== "schematic" && stop.kind !== "assembly" && stop.kind !== "footer",
  );
  return demoLandingScrollStopsDedupe([...withoutTail, ...postChapter]).sort(
    (a, b) => a.scrollY - b.scrollY,
  );
}

/** Merge only same-kind neighbors within minGap (never collapse beat vs schematic). */
export function demoLandingScrollStopsDedupe(
  stops: readonly DemoLandingScrollStop[],
  minGapPx = 28,
): DemoLandingScrollStop[] {
  if (stops.length === 0) {
    return [];
  }
  const sorted = [...stops].sort((a, b) => a.scrollY - b.scrollY);
  const out: DemoLandingScrollStop[] = [];
  for (const stop of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.kind === stop.kind &&
      stop.scrollY - prev.scrollY < minGapPx
    ) {
      out[out.length - 1] = stop;
      continue;
    }
    out.push(stop);
  }
  return out;
}

/** After momentum, snap only to the next/previous stop in the last gesture direction (never backward). */
export function demoLandingScrollStopSettleTargetIndex(
  stops: readonly DemoLandingScrollStop[],
  scrollY: number,
  scrollDirection: -1 | 0 | 1,
  epsilonPx = 24,
): number | null {
  if (scrollDirection === 0) {
    return null;
  }
  return demoLandingScrollStopStepTargetIndex(stops, scrollY, scrollDirection, epsilonPx);
}

/** Next/previous landing stop for keyboard or capped wheel (epsilon avoids re-selecting current). */
export function demoLandingScrollStopStepTargetIndex(
  stops: readonly DemoLandingScrollStop[],
  scrollY: number,
  direction: -1 | 1,
  epsilonPx = 24,
): number | null {
  if (stops.length === 0) {
    return null;
  }
  if (direction > 0) {
    for (let i = 0; i < stops.length; i += 1) {
      if (stops[i].scrollY > scrollY + epsilonPx) {
        return i;
      }
    }
    return null;
  }
  for (let i = stops.length - 1; i >= 0; i -= 1) {
    if (stops[i].scrollY < scrollY - epsilonPx) {
      return i;
    }
  }
  return null;
}

/** True while scroll is inside the scrub chapter (pre-handoff through confirmed end-hold). */
export function demoLandingWheelCapRegion(
  scrollY: number,
  scrubEndScrollY: number,
  footerScrollY: number,
) {
  return scrollY <= footerScrollY + 32 && scrollY >= -8 && scrubEndScrollY > 0;
}

export function demoBeatTrackSnapAlignmentDeltaDirected(
  trackViewportTop: number,
  stickyTop: number,
  scrollDirection: -1 | 0 | 1,
  tolerancePx = 14,
): number | null {
  const delta = demoBeatTrackSnapAlignmentDelta(trackViewportTop, stickyTop, tolerancePx);
  if (delta === null) {
    return null;
  }
  if (scrollDirection > 0 && delta < 0) {
    return null;
  }
  if (scrollDirection < 0 && delta > 0) {
    return null;
  }
  return delta;
}

/** Beat track index before clamping to the last track (aligner bail when past chapter). */
export function demoBeatTrackRawIndexFromScroll(
  scrolled: number,
  preHandoffHeight: number,
  beatTrackHeight: number,
) {
  if (beatTrackHeight <= 0) {
    return 0;
  }
  const trackPix = Math.max(0, scrolled - preHandoffHeight);
  return Math.floor((trackPix + beatTrackHeight * 0.28) / beatTrackHeight);
}

export function demoInBeatSnapChapter(
  scrolled: number,
  preHandoffHeight: number,
  beatTrackHeight: number,
  beatCount: number,
) {
  if (beatTrackHeight <= 0 || beatCount <= 0) {
    return false;
  }
  const chapterStart = preHandoffHeight - beatTrackHeight * 0.22;
  const chapterEnd = demoBeatSnapChapterEnd(preHandoffHeight, beatTrackHeight, beatCount);
  return scrolled >= chapterStart && scrolled <= chapterEnd;
}

/**
 * Map scroll offset through pre-handoff markers + equal post-pin beat tracks to linear scrub [0, 1].
 */
export function demoBeatTrackScrubLinear(
  scrolled: number,
  scrollable: number,
  preHandoffHeight: number,
  beatTrackHeight: number,
  beatCount: number,
  handoffLinearStart = workflowHandoffLinearStart(),
  viewportWidth = 1280,
) {
  if (scrollable <= 0) {
    return scrolled > 0 ? 1 : 0;
  }
  const active = 1 - demoScrubEndHoldFraction(viewportWidth);
  const raw = clampDemoScrollProgress(scrolled / scrollable);
  if (raw >= active) {
    return 1;
  }
  const cap = scrollable * active;
  const pix = Math.min(Math.max(0, scrolled), cap);
  if (beatCount <= 0 || beatTrackHeight <= 0 || cap <= 0) {
    return clampDemoScrollProgress(raw / active);
  }

  const mapTrackChapter = (trackPix: number) => {
    const tracksTotal = beatCount * beatTrackHeight;
    const clamped = Math.min(Math.max(0, trackPix), tracksTotal);
    const trackIdx = Math.min(
      beatCount - 1,
      Math.max(0, Math.floor((clamped + beatTrackHeight * 0.28) / beatTrackHeight)),
    );
    return workflowScrubLinearForStatusBeatIndex(trackIdx);
  };

  let linear = 0;
  if (pix <= preHandoffHeight || preHandoffHeight <= 0) {
    const t = preHandoffHeight <= 0 ? 1 : pix / preHandoffHeight;
    linear = t * handoffLinearStart;
  } else {
    linear = mapTrackChapter(pix - preHandoffHeight);
  }
  return clampDemoScrollProgress(linear / active);
}

export function workflowStatusBeatCount() {
  return demoQuoteStatusBeatThresholds().length;
}

/** Equal linear scrub share per quote-status beat in the handoff chapter. */
export function workflowStatusBeatLinearShare() {
  const start = workflowHandoffLinearStart();
  const n = workflowStatusBeatCount();
  if (n <= 0) {
    return 0;
  }
  return (1 - start) / n;
}

export function workflowScrubLinearForStatusBeatIndex(index: number) {
  const start = workflowHandoffLinearStart();
  const share = workflowStatusBeatLinearShare();
  return clampDemoScrollProgress(start + index * share);
}

function interpolateWorkflowScrubMap(linear: number) {
  const p = clampDemoScrollProgress(linear);
  const first = WORKFLOW_SCRUB_MAP[0];
  if (!first || p <= first.linear) {
    return first?.visual ?? 0;
  }
  for (let i = 1; i < WORKFLOW_SCRUB_MAP.length; i += 1) {
    const end = WORKFLOW_SCRUB_MAP[i];
    const start = WORKFLOW_SCRUB_MAP[i - 1];
    if (!end || !start || p > end.linear) {
      continue;
    }
    const span = end.linear - start.linear;
    const linearT = span <= 0 ? 1 : (p - start.linear) / span;
    const t = easeBetweenPlateaus(i) ? smoothstep(linearT) : linearT;
    return start.visual + t * (end.visual - start.visual);
  }
  const last = WORKFLOW_SCRUB_MAP[WORKFLOW_SCRUB_MAP.length - 1];
  return last?.visual ?? 1;
}

export function workflowScrubPlayhead(linearProgress: number) {
  return clampDemoScrollProgress(interpolateWorkflowScrubMap(linearProgress));
}

export function workflowScrubLinearForVisual(targetVisual: number) {
  const target = clampDemoScrollProgress(targetVisual);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (interpolateWorkflowScrubMap(mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Linear scrub at the start of the handoff segment for a quote-thread playhead threshold. */
export function workflowScrubLinearForThreadPlayhead(targetPlayhead: number) {
  const target = clampDemoScrollProgress(targetPlayhead);
  const thresholds = demoQuoteStatusBeatThresholds();
  let index = 0;
  for (let i = 0; i < thresholds.length; i += 1) {
    const at = thresholds[i] ?? 0;
    if (at <= target + 1e-5) {
      index = i;
    }
  }
  return workflowScrubLinearForStatusBeatIndex(index);
}

const WORKFLOW_STEP_SNAP_LABELS: Record<WorkflowStep, string> = {
  hub: "Intro",
  find: "Find part",
  select: "Select part",
  quote: "Quote tray",
  send: "Request quote",
  handoff: "Quote thread",
};

export function workflowScrubSnapBeatLabel(linear: number) {
  const handoffLinear = workflowScrubLinearForVisual(WORKFLOW_HANDOFF_START);
  if (linear + 1e-4 < handoffLinear) {
    const visual = workflowScrubPlayhead(linear);
    return WORKFLOW_STEP_SNAP_LABELS[workflowStep(visual)];
  }
  const frame = reduceDemoFrame("quote", demoWorkflowThreadPlayhead(linear));
  return QUOTE_STATUS_LABELS[frame.quoteStatus];
}

/** Linear scrub positions where scroll should snap (workflow plateaus + each quote status). */
export function workflowScrubSnapLinearPositions() {
  const handoffLinear = workflowScrubLinearForVisual(WORKFLOW_HANDOFF_START);
  const positions = new Set<number>([0, 1]);
  for (const anchor of WORKFLOW_SCRUB_MAP) {
    if (anchor.linear <= handoffLinear + 1e-4) {
      positions.add(anchor.linear);
    }
  }
  const statusCount = workflowStatusBeatCount();
  for (let i = 0; i < statusCount; i += 1) {
    positions.add(workflowScrubLinearForStatusBeatIndex(i));
  }
  const sorted = [...positions].sort((a, b) => a - b);
  return sorted.filter((pos, index) => index === 0 || pos - sorted[index - 1]! > 1e-5);
}

export type WorkflowGuideTarget = "scroll" | "orbit" | "hotspot" | "add" | "quote" | "request";

export function workflowGuideStagePoint(
  stage: { left: number; top: number; width: number; height: number },
  target: { left: number; top: number; width: number; height: number },
) {
  if (stage.width <= 0 || stage.height <= 0) {
    return null;
  }
  return {
    x: ((target.left + target.width / 2 - stage.left) / stage.width) * 100,
    y: ((target.top + target.height / 2 - stage.top) / stage.height) * 100,
  };
}

export function workflowGuideTargetSelector(target: WorkflowGuideTarget) {
  return `[data-guide-target="${target}"]`;
}

export function workflowHighlightPartId(step: WorkflowStep) {
  if (step === "select" || step === "quote" || step === "send") {
    return WORKFLOW_DEMO_PART;
  }
  return null;
}

export function workflowMeshNameMatchesPart(meshName: string, partId: string) {
  if (!meshName || !partId) {
    return false;
  }
  if (meshName === partId) {
    return true;
  }
  const needle = partId.toLowerCase();
  return meshName.toLowerCase().includes(needle);
}

export type WorkflowAnchorMesh = {
  name: string;
  x: number;
  y: number;
  z: number;
};

export const WORKFLOW_DEMO_MOTOR = "PN-MTR-3301";

export type WorkflowStagePoint = { x: number; y: number };

export type WorkflowStageAnchors = {
  machine: WorkflowStagePoint | null;
  part: WorkflowStagePoint | null;
};

function anchorDistance(a: WorkflowAnchorMesh, b: WorkflowAnchorMesh) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function workflowDemoRollerIndex(
  meshes: readonly WorkflowAnchorMesh[],
  partId: string,
  motorName = WORKFLOW_DEMO_MOTOR,
) {
  const motor = meshes.find((mesh) => mesh.name === motorName);
  const rollers = meshes
    .map((mesh, index) => ({ mesh, index }))
    .filter(({ mesh }) => mesh.name !== motorName && workflowMeshNameMatchesPart(mesh.name, partId));
  if (rollers.length === 0) {
    return null;
  }
  if (!motor) {
    return rollers[0]?.index ?? null;
  }
  let best = rollers[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const roller of rollers) {
    const dist = anchorDistance(roller.mesh, motor);
    if (dist < bestDist) {
      best = roller;
      bestDist = dist;
    }
  }
  return best?.index ?? null;
}

export function workflowGuideCue(playhead: number): {
  target: WorkflowGuideTarget | null;
  x: number;
  y: number;
} {
  const p = clampDemoScrollProgress(playhead);
  const step = workflowStep(p);
  if (step === "handoff" || p >= WORKFLOW_HANDOFF_START) {
    return { target: null, x: 50, y: 50 };
  }
  if (step === "send") {
    return { target: "request", x: 79, y: 90 };
  }
  if (step === "quote") {
    return { target: "quote", x: 84, y: 58 };
  }
  if (step === "select") {
    if (p < WORKFLOW_SELECT_ADD) {
      return { target: "hotspot", x: 52, y: 46 };
    }
    return { target: "add", x: 22, y: 26 };
  }
  if (step === "find") {
    return { target: "orbit", x: 56, y: 50 };
  }
  return { target: "scroll", x: 50, y: 74 };
}

export function workflowStep(playhead: number): WorkflowStep {
  const p = clampDemoScrollProgress(playhead);
  if (p >= WORKFLOW_HANDOFF_START) {
    return "handoff";
  }
  if (p >= WORKFLOW_SEND_START) {
    return "send";
  }
  if (p >= WORKFLOW_QUOTE_START) {
    return "quote";
  }
  if (p >= WORKFLOW_SELECT_START) {
    return "select";
  }
  if (p >= WORKFLOW_FIND_START) {
    return "find";
  }
  return "hub";
}

export function workflowIntroFade(playhead: number) {
  const p = clampDemoScrollProgress(playhead);
  if (p >= WORKFLOW_SELECT_START) {
    return 0;
  }
  return clampDemoScrollProgress(1 - p / WORKFLOW_SELECT_START);
}

/** 0–1 mix for fading the model behind the quote thread. */
export function workflowHandoffMix(playhead: number) {
  const p = clampDemoScrollProgress(playhead);
  if (p <= WORKFLOW_HANDOFF_START) {
    return 0;
  }
  if (p >= WORKFLOW_HANDOFF_COMPLETE) {
    return 1;
  }
  const span = WORKFLOW_HANDOFF_COMPLETE - WORKFLOW_HANDOFF_START;
  const t = (p - WORKFLOW_HANDOFF_START) / span;
  return clampDemoScrollProgress(t);
}

/** 0–1 playhead for `reduceDemoFrame("quote", …)` during the workflow handoff chapter. */
export function workflowQuoteChatPlayhead(playhead: number) {
  const p = clampDemoScrollProgress(playhead);
  if (p < WORKFLOW_CHAT_START) {
    return 0;
  }
  const span = 1 - WORKFLOW_CHAT_START;
  if (span <= 0) {
    return 1;
  }
  return clampDemoScrollProgress((p - WORKFLOW_CHAT_START) / span);
}

/** Map linear scrub progress to quote-thread beat visibility (equal share per beat in handoff). */
export function demoWorkflowThreadPlayhead(workflowProgress: number) {
  const linear = clampDemoScrollProgress(workflowProgress);
  const visual = workflowScrubPlayhead(linear);
  if (visual < WORKFLOW_HANDOFF_START) {
    return 0;
  }
  const linearStart = workflowHandoffLinearStart();
  if (linear <= linearStart) {
    return 0;
  }
  const chapter = clampDemoScrollProgress((linear - linearStart) / (1 - linearStart));
  const thresholds = demoQuoteStatusBeatThresholds();
  const n = thresholds.length;
  if (n <= 1) {
    return chapter;
  }
  const scaled = chapter * n;
  const idx = Math.min(n - 1, Math.floor(scaled));
  const local = scaled - idx;
  const from = thresholds[idx] ?? 0;
  const to = thresholds[idx + 1] ?? 1;
  const plateau = WORKFLOW_STATUS_BEAT_PLATEAU;
  if (idx >= n - 1) {
    if (local < plateau) {
      return from;
    }
    return 1;
  }
  if (local < plateau) {
    return from;
  }
  if (local > 1 - plateau) {
    return to;
  }
  const t = (local - plateau) / (1 - 2 * plateau);
  return from + t * (to - from);
}

/** Scroll-driven yaw for the marketing workflow cell (radians). */
export function workflowSpinYaw(playhead: number) {
  const p = clampDemoScrollProgress(playhead);
  if (p < WORKFLOW_FIND_START) {
    return 0.12;
  }
  if (p < WORKFLOW_SELECT_START) {
    const t = (p - WORKFLOW_FIND_START) / (WORKFLOW_SELECT_START - WORKFLOW_FIND_START);
    return 0.12 + t * 1.75;
  }
  return 1.87;
}

export const WORKFLOW_DEMO_PART = "PN-ROLL-2104";
export const WORKFLOW_DEMO_PART_NAME = "Infeed drive roller";
export const WORKFLOW_DEMO_QTY: number = 2;

const TUTORIAL_COPY =
  /\b(scroll to|watch|see how|imagine|discover|unlock|experience|journey|seamless|magic|keep scrolling|open the cell|orbit the|tap the roller)\b/i;

export function marketingTutorialCopyBan(text: string) {
  return TUTORIAL_COPY.test(text);
}

export const DEMO_ALL_SCRIPT_BEATS: readonly DemoBeat[] = [
  ...DEMO_QUOTE_SCRIPT,
  ...DEMO_TICKET_SCRIPT,
];
