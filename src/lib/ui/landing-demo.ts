import type { QuoteActivity, QuoteStatus, Role, TicketStatus } from "../../types/index.ts";
import { activityLane, sameMessageAuthor, type ActivityLane } from "./activity-lane.ts";

export type MarketingPerspective = "customer" | "staff";
export type LandingDemoVariant = "quote" | "ticket";

export const DEMO_CUSTOMER_EMAIL = "maya@northline-pack.example";
export const DEMO_STAFF_EMAIL = "owen@oee360.example";
export const DEMO_PLANT = "Northline Packing";
export const DEMO_MACHINE = "Palletizer cell";
export const DEMO_TICKET_TITLE = "Infeed jam, drive roller";
export const DEMO_QUOTE_TITLE = "PN-ROLL-2104 × 2";

/** Full loop length for the parts-quote demo (reading pace + pause between steps). */
export const DEMO_QUOTE_DURATION_MS = 42_000;
/** Full loop length for the Care ticket demo. */
export const DEMO_TICKET_DURATION_MS = 32_000;

export type DemoBeat =
  | {
      atMs: number;
      kind: "message";
      id: string;
      actorRole: Role;
      text: string;
    }
  | {
      atMs: number;
      kind: "system";
      id: string;
      text: string;
    }
  | { atMs: number; kind: "ticketStatus"; status: TicketStatus }
  | { atMs: number; kind: "quoteStatus"; status: QuoteStatus };

export type DemoMessageRow = {
  kind: "message";
  id: string;
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
  text: string;
};

export type DemoVisibleRow = DemoMessageRow | DemoSystemRow;

export type DemoClockState = {
  ticketStatus: TicketStatus;
  quoteStatus: QuoteStatus;
  rows: DemoVisibleRow[];
};

export const DEMO_QUOTE_SCRIPT: readonly DemoBeat[] = [
  { atMs: 0, kind: "quoteStatus", status: "requested" },
  {
    atMs: 0,
    kind: "message",
    id: "q-m1",
    actorRole: "customer",
    text: "Need two PN-ROLL-2104 for the palletizer infeed. What's lead time?",
  },
  { atMs: 3_200, kind: "system", id: "q-s1", text: "Quote request received" },
  { atMs: 5_400, kind: "quoteStatus", status: "in_review" },
  {
    atMs: 8_600,
    kind: "message",
    id: "q-m2",
    actorRole: "staff",
    text: "Checking stock and freight to your dock.",
  },
  { atMs: 11_800, kind: "quoteStatus", status: "pricing" },
  { atMs: 14_200, kind: "system", id: "q-s2", text: "Quote in pricing" },
  {
    atMs: 18_400,
    kind: "message",
    id: "q-m3",
    actorRole: "staff",
    text: "Two rollers, Friday dock if you PO today. Sending the formal quote now.",
  },
  { atMs: 22_600, kind: "quoteStatus", status: "quoted" },
  { atMs: 25_400, kind: "system", id: "q-s3", text: "Quote ready" },
  {
    atMs: 29_800,
    kind: "message",
    id: "q-m4",
    actorRole: "customer",
    text: "PO 4418 is in. Need them on the line Friday.",
  },
  { atMs: 33_600, kind: "quoteStatus", status: "po_received" },
  { atMs: 36_200, kind: "system", id: "q-s4", text: "PO received" },
  {
    atMs: 39_400,
    kind: "message",
    id: "q-m5",
    actorRole: "staff",
    text: "Confirmed. Parts leave the crib tonight.",
  },
  { atMs: 41_200, kind: "quoteStatus", status: "confirmed" },
  { atMs: 42_000, kind: "system", id: "q-s5", text: "Quote confirmed" },
];

export const DEMO_TICKET_SCRIPT: readonly DemoBeat[] = [
  { atMs: 0, kind: "ticketStatus", status: "open" },
  {
    atMs: 0,
    kind: "message",
    id: "t-m1",
    actorRole: "customer",
    text: "Palletizer jammed on the infeed. Drive roller looks shot.",
  },
  { atMs: 2_800, kind: "system", id: "t-s1", text: "Care ticket opened" },
  {
    atMs: 5_600,
    kind: "message",
    id: "t-m2",
    actorRole: "staff",
    text: "I see it on the cell camera. Logging PN-ROLL-2104 on the BOM.",
  },
  { atMs: 8_400, kind: "ticketStatus", status: "in_progress" },
  { atMs: 10_200, kind: "system", id: "t-s2", text: "Ticket → In progress" },
  {
    atMs: 13_600,
    kind: "message",
    id: "t-m3",
    actorRole: "staff",
    text: "Replacements are in the crib. Want us to walk your tech through the swap?",
  },
  { atMs: 17_200, kind: "ticketStatus", status: "waiting_on_customer" },
  { atMs: 19_000, kind: "system", id: "t-s3", text: "Waiting on plant" },
  {
    atMs: 22_800,
    kind: "message",
    id: "t-m4",
    actorRole: "customer",
    text: "We're staffed for it—send the steps and we'll confirm when we're green.",
  },
  { atMs: 26_400, kind: "ticketStatus", status: "in_progress" },
  { atMs: 28_200, kind: "system", id: "t-s4", text: "Ticket → In progress" },
  {
    atMs: 31_600,
    kind: "message",
    id: "t-m5",
    actorRole: "staff",
    text: "Steps are in the thread. I'll keep the ticket open until you close the loop.",
  },
  { atMs: 32_000, kind: "ticketStatus", status: "resolved" },
  { atMs: 32_000, kind: "system", id: "t-s5", text: "Ticket resolved" },
];

export function demoDurationMs(variant: LandingDemoVariant) {
  return variant === "quote" ? DEMO_QUOTE_DURATION_MS : DEMO_TICKET_DURATION_MS;
}

export function demoScript(variant: LandingDemoVariant) {
  return variant === "quote" ? DEMO_QUOTE_SCRIPT : DEMO_TICKET_SCRIPT;
}

export function demoSelf(perspective: MarketingPerspective): { email: string; role: Role } {
  return perspective === "customer"
    ? { email: DEMO_CUSTOMER_EMAIL, role: "customer" }
    : { email: DEMO_STAFF_EMAIL, role: "staff" };
}

export function demoActorEmail(role: Role) {
  return role === "customer" ? DEMO_CUSTOMER_EMAIL : DEMO_STAFF_EMAIL;
}

export function demoOtherLabel(perspective: MarketingPerspective) {
  return perspective === "customer" ? "Staff" : DEMO_PLANT;
}

/** Extra viewport height scrolled while the demo pair stays pinned (reading pace). */
export const DEMO_SCRUB_EXTRA_VH = 168;

export function clampDemoScrollProgress(progress: number) {
  return Math.min(1, Math.max(0, progress));
}

/** Map a pinned section's position to scrub progress 0→1. */
export function demoSectionScrollProgress(
  sectionTop: number,
  sectionHeight: number,
  viewportHeight: number,
  stickyTop = 0,
) {
  const scrollable = sectionHeight - viewportHeight;
  if (scrollable <= 0) {
    return sectionTop <= stickyTop ? 1 : 0;
  }
  const scrolled = stickyTop - sectionTop;
  return clampDemoScrollProgress(scrolled / scrollable);
}

export function demoElapsedFromProgress(
  reduceMotion: boolean,
  progress: number,
  durationMs: number,
) {
  if (reduceMotion) {
    return durationMs;
  }
  return clampDemoScrollProgress(progress) * durationMs;
}

function asActivity(beat: Extract<DemoBeat, { kind: "message" | "system" }>): QuoteActivity {
  const actorRole = beat.kind === "message" ? beat.actorRole : "staff";
  return {
    id: beat.id,
    at: new Date(0).toISOString(),
    actorRole,
    actorEmail: demoActorEmail(actorRole),
    kind: beat.kind === "message" ? "message" : "status",
    text: beat.text,
  };
}

export function reduceDemoClock(
  beats: readonly DemoBeat[],
  elapsedMs: number,
  perspective: MarketingPerspective,
): DemoClockState {
  const self = demoSelf(perspective);
  let ticketStatus: TicketStatus = "open";
  let quoteStatus: QuoteStatus = "requested";
  const raw: QuoteActivity[] = [];

  for (const beat of beats) {
    if (beat.atMs > elapsedMs) {
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
    raw.push(asActivity(beat));
  }

  const rows: DemoVisibleRow[] = raw.map((activity, index) => {
    const lane = activityLane(activity, self);
    if (lane === "system") {
      return { kind: "system", id: activity.id, text: activity.text };
    }
    const prev = raw[index - 1];
    const next = raw[index + 1];
    return {
      kind: "message",
      id: activity.id,
      lane,
      text: activity.text,
      actorEmail: activity.actorEmail,
      actorRole: activity.actorRole,
      stacked: sameMessageAuthor(activity, prev),
      lastInStack: !sameMessageAuthor(activity, next),
    };
  });

  return { ticketStatus, quoteStatus, rows };
}

export function marketingCopyBan(text: string) {
  return /\bPlatform\b|\bHosts\b|\bHost staff\b|\bmulti-tenant\b/i.test(text);
}

/** All scripted beats for marketing copy checks. */
export const DEMO_ALL_SCRIPT_BEATS: readonly DemoBeat[] = [
  ...DEMO_QUOTE_SCRIPT,
  ...DEMO_TICKET_SCRIPT,
];
