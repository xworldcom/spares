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

export const DEMO_SCRUB_EXTRA_SVH = 280;

export const DEMO_SCRUB_END_HOLD = 0.14;

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
    text: "We're staffed for it—send the steps and we'll confirm when we're green.",
  },
  { at: 0.8, kind: "ticketStatus", status: "in_progress" },
  { at: 0.82, kind: "system", id: "t-s4", text: "Ticket → In progress" },
  {
    at: 0.94,
    kind: "message",
    id: "t-m5",
    actor: "oem",
    text: "Steps are in the thread. I'll keep the ticket open until you close the loop.",
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
) {
  const scrollable = sectionHeight - pinHeight;
  if (scrollable <= 0) {
    return sectionTop <= stickyTop ? 1 : 0;
  }
  const scrolled = stickyTop - sectionTop;
  const raw = clampDemoScrollProgress(scrolled / scrollable);
  const active = 1 - DEMO_SCRUB_END_HOLD;
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
  const windowScroll = Math.max(0, windowY);
  const rootScroll = Math.max(0, rootY);
  const visualScroll = Math.max(0, visualPageTop);
  if (rootScroll > windowScroll + 1) {
    return rootScroll;
  }
  if (visualScroll > windowScroll + 1) {
    return visualScroll;
  }
  return Math.max(windowScroll, rootScroll, visualScroll);
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

export type WorkflowStep = "model" | "spin" | "pick" | "quote" | "submit";

export const WORKFLOW_SPIN_START = 0.18;
export const WORKFLOW_PICK_START = 0.38;
export const WORKFLOW_QUOTE_START = 0.58;
export const WORKFLOW_SUBMIT_START = 0.78;

export function workflowStep(playhead: number): WorkflowStep {
  const p = clampDemoScrollProgress(playhead);
  if (p >= WORKFLOW_SUBMIT_START) {
    return "submit";
  }
  if (p >= WORKFLOW_QUOTE_START) {
    return "quote";
  }
  if (p >= WORKFLOW_PICK_START) {
    return "pick";
  }
  if (p >= WORKFLOW_SPIN_START) {
    return "spin";
  }
  return "model";
}

/** Scroll-driven yaw for the marketing workflow cell (radians). */
export function workflowSpinYaw(playhead: number) {
  const p = clampDemoScrollProgress(playhead);
  if (p < WORKFLOW_SPIN_START) {
    return 0.12;
  }
  if (p < WORKFLOW_PICK_START) {
    const t = (p - WORKFLOW_SPIN_START) / (WORKFLOW_PICK_START - WORKFLOW_SPIN_START);
    return 0.12 + t * 1.75;
  }
  return 1.87;
}

export const WORKFLOW_DEMO_PART = "PN-ROLL-2104";
export const WORKFLOW_DEMO_QTY = 2;

export const DEMO_ALL_SCRIPT_BEATS: readonly DemoBeat[] = [
  ...DEMO_QUOTE_SCRIPT,
  ...DEMO_TICKET_SCRIPT,
];
