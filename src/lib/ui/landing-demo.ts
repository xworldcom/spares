import type { QuoteActivity, QuoteStatus, Role, TicketStatus } from "../../types/index.ts";
import { activityLane, sameMessageAuthor, type ActivityLane } from "./activity-lane.ts";

export type MarketingPerspective = "customer" | "staff";

export const DEMO_CUSTOMER_EMAIL = "maya@northline-pack.example";
export const DEMO_STAFF_EMAIL = "owen@oee360.example";
export const DEMO_PLANT = "Northline Packing";
export const DEMO_MACHINE = "Palletizer cell";
export const DEMO_TICKET_TITLE = "Infeed jam, drive roller";
export const DEMO_QUOTE_TITLE = "PN-ROLL-2104 × 2";
export const DEMO_DURATION_MS = 12_000;

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

export const DEMO_SCRIPT: readonly DemoBeat[] = [
  { atMs: 0, kind: "ticketStatus", status: "open" },
  { atMs: 0, kind: "quoteStatus", status: "requested" },
  {
    atMs: 280,
    kind: "message",
    id: "m1",
    actorRole: "customer",
    text: "Palletizer jammed on the infeed. Drive roller looks shot.",
  },
  { atMs: 1100, kind: "system", id: "s1", text: "Care ticket opened" },
  {
    atMs: 1900,
    kind: "message",
    id: "m2",
    actorRole: "staff",
    text: "I see PN-ROLL-2104 on the infeed. Quoting two plus freight.",
  },
  { atMs: 2700, kind: "ticketStatus", status: "in_progress" },
  { atMs: 2700, kind: "quoteStatus", status: "in_review" },
  { atMs: 3100, kind: "system", id: "s2", text: "Ticket → In progress" },
  { atMs: 4000, kind: "quoteStatus", status: "pricing" },
  { atMs: 4400, kind: "system", id: "s3", text: "Quote in pricing" },
  {
    atMs: 5300,
    kind: "message",
    id: "m3",
    actorRole: "staff",
    text: "Quote is ready. Two rollers, Friday dock if you PO today.",
  },
  { atMs: 5900, kind: "quoteStatus", status: "quoted" },
  {
    atMs: 6800,
    kind: "message",
    id: "m4",
    actorRole: "customer",
    text: "PO 4418 is in. Need them on the line Friday.",
  },
  { atMs: 7600, kind: "quoteStatus", status: "po_received" },
  { atMs: 8000, kind: "system", id: "s4", text: "PO received" },
  {
    atMs: 8800,
    kind: "message",
    id: "m5",
    actorRole: "staff",
    text: "Confirmed. Parts leave the crib tonight.",
  },
  { atMs: 9400, kind: "quoteStatus", status: "confirmed" },
  { atMs: 9800, kind: "system", id: "s5", text: "Quote confirmed" },
];

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

export function demoClockElapsed(reduceMotion: boolean, elapsedMs: number) {
  if (reduceMotion) {
    return DEMO_DURATION_MS;
  }
  return elapsedMs % (DEMO_DURATION_MS + 1400);
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
