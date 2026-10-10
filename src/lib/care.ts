import { canAccessMachine } from "./access.ts";
import type {
  MachineUsage,
  ManualCategory,
  PublicUser,
  Role,
  ServiceTicket,
  ServiceTicketRecord,
  Site,
  TicketActivity,
  TicketCustomerReadReceipt,
  TicketStatus,
  UsageHistoryEntry,
} from "../types/index.ts";
import { displayChatMessageText } from "./ui/chat-message-text.ts";

export const MANUAL_CATEGORIES = [
  "operator",
  "maintenance",
  "electrical",
  "mechanical",
  "hmi",
  "safety",
] as const satisfies readonly ManualCategory[];

export const MANUAL_CATEGORY_LABELS: Record<ManualCategory, string> = {
  operator: "Operator",
  maintenance: "Maintenance",
  electrical: "Electrical",
  mechanical: "Mechanical",
  hmi: "HMI",
  safety: "Safety",
};

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_on_customer",
  "resolved",
  "closed",
] as const satisfies readonly TicketStatus[];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on customer",
  resolved: "Resolved",
  closed: "Closed",
};

export const TICKET_STATUS_SHORT: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "Progress",
  waiting_on_customer: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

export const MANUAL_MAX_BYTES = 50 * 1024 * 1024;
export const MAX_CARE_TEXT = 2000;
export const MAX_TICKET_TITLE = 160;
export const MAX_MANUAL_TITLE = 160;
export const MAX_USAGE_NOTES = 4000;

const MANUAL_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

export function isManualCategory(value: unknown): value is ManualCategory {
  return (
    typeof value === "string" &&
    (MANUAL_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === "string" &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export function manualExtension(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) {
    return ".docx";
  }
  if (lower.endsWith(".doc")) {
    return ".doc";
  }
  return ".pdf";
}

export function isManualFilename(filename: string) {
  const lower = filename.toLowerCase();
  return MANUAL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function manualContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) {
    return "application/msword";
  }
  return "application/pdf";
}

export function formatManualMegabytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) {
    return String(Math.round(mb));
  }
  const rounded = Math.round(mb * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function manualOverLimitMessage(bytes: number) {
  return `This file is ${formatManualMegabytes(bytes)} MB. Care manuals can be up to ${formatManualMegabytes(MANUAL_MAX_BYTES)} MB.`;
}

export function parseCareText(
  raw: unknown,
  label: string,
  max = MAX_CARE_TEXT,
): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: `${label} is required` };
  }
  const text = raw.trim();
  if (text.length > max) {
    return {
      ok: false,
      error: `${label} must be ${max} characters or fewer`,
    };
  }
  return { ok: true, text };
}

export function parseOptionalCareText(
  raw: unknown,
  label: string,
  max: number,
): { ok: true; text: string | undefined } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, text: undefined };
  }
  return parseCareText(raw, label, max);
}

export function parseOptionalNumber(
  raw: unknown,
  label: string,
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: undefined };
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: `${label} must be a number 0 or greater` };
  }
  return { ok: true, value };
}

export function parseOptionalDate(
  raw: unknown,
  label: string,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: `${label} must be a date` };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `${label} must be a valid date` };
  }
  return { ok: true, value: trimmed };
}

export function canAccessCareMachine(
  user: Pick<PublicUser, "role" | "siteIds" | "companyAccess" | "machineIds">,
  machine: { id?: string; siteId?: string | null; company?: string | null },
  sites: readonly Site[] = [],
  accounts: readonly import("../types/index.ts").CustomerAccount[] = [],
) {
  return canAccessMachine(user, machine, sites, accounts);
}

export function canManageCare(user: Pick<PublicUser, "role">) {
  return user.role === "staff";
}

export function ticketIsOpen(status: TicketStatus) {
  return status === "open" || status === "in_progress" || status === "waiting_on_customer";
}

export function ticketStepState(
  status: TicketStatus,
  step: TicketStatus,
): "done" | "current" | "todo" {
  const current = TICKET_STATUSES.indexOf(status);
  const index = TICKET_STATUSES.indexOf(step);
  if (index < current) {
    return "done";
  }
  if (index === current) {
    return "current";
  }
  return "todo";
}

export function statusTicketText(status: TicketStatus) {
  return `Status set to ${TICKET_STATUS_LABELS[status]}`;
}

export function nextTicketNumber(tickets: readonly { number?: number }[]) {
  let max = 0;
  for (const ticket of tickets) {
    if (typeof ticket.number === "number" && ticket.number > max) {
      max = ticket.number;
    }
  }
  return max + 1;
}

export function isTicketUnreadForUser(
  ticket: Pick<ServiceTicketRecord, "activities" | "lastReadAt">,
  user: Pick<PublicUser, "id" | "email" | "role">,
) {
  const lastRead = ticket.lastReadAt[user.id];
  const newestForeign = ticket.activities.reduce((max, activity) => {
    if (activity.actorEmail === user.email && activity.actorRole === user.role) {
      return max;
    }
    return activity.at > max ? activity.at : max;
  }, "");

  if (!lastRead) {
    if (newestForeign) {
      return true;
    }
    return user.role === "staff";
  }

  return Boolean(newestForeign && newestForeign > lastRead);
}

export function countUnreadTickets<
  T extends Pick<ServiceTicketRecord, "activities" | "lastReadAt">,
>(tickets: readonly T[], user: Pick<PublicUser, "id" | "email" | "role">) {
  return tickets.filter((ticket) => isTicketUnreadForUser(ticket, user)).length;
}

export function ticketLatestActivityAt(
  ticket: { activities: ReadonlyArray<{ at: string }> },
) {
  return ticket.activities.at(-1)?.at;
}

/** True when a customer user's read watermark covers the latest ticket activity. */
export function isCustomerReadThroughTicket(
  ticket: Pick<ServiceTicketRecord, "activities" | "lastReadAt">,
  customerUserId: string,
) {
  const latest = ticketLatestActivityAt(ticket);
  if (!latest) {
    return false;
  }
  const readAt = ticket.lastReadAt[customerUserId];
  if (!readAt) {
    return false;
  }
  return readAt >= latest;
}

export function customerReadReceiptsForThread(
  thread: {
    activities: ReadonlyArray<{ at: string }>;
    lastReadAt: Record<string, string>;
    customerId?: string;
    customerEmail?: string;
  },
  customerUsers: readonly Pick<PublicUser, "id" | "email" | "name" | "role">[],
): TicketCustomerReadReceipt[] {
  const latest = ticketLatestActivityAt(thread);
  if (!latest) {
    return [];
  }
  const byId = new Map(customerUsers.map((row) => [row.id, row]));
  const receipts: TicketCustomerReadReceipt[] = [];
  for (const [userId, readAt] of Object.entries(thread.lastReadAt)) {
    const customer = byId.get(userId);
    if (!customer || customer.role !== "customer") {
      continue;
    }
    if (readAt >= latest) {
      receipts.push({
        userId,
        email: customer.email,
        name: customer.name,
        readAt,
      });
    }
  }
  receipts.sort((a, b) => a.email.localeCompare(b.email));
  return receipts;
}

export function customerReadReceiptsForTicket(
  ticket: ServiceTicketRecord,
  customerUsers: readonly Pick<PublicUser, "id" | "email" | "name" | "role">[],
): TicketCustomerReadReceipt[] {
  return customerReadReceiptsForThread(
    {
      activities: ticket.activities,
      lastReadAt: ticket.lastReadAt,
      customerId: ticket.customerId,
      customerEmail: ticket.customerEmail,
    },
    customerUsers,
  );
}

export function toPublicTicket(
  ticket: ServiceTicketRecord,
  user: Pick<PublicUser, "id" | "email" | "role">,
  machineName?: string,
  options?: {
    customerUsers?: readonly Pick<PublicUser, "id" | "email" | "name" | "role">[];
  },
): ServiceTicket {
  const base: ServiceTicket = {
    id: ticket.id,
    number: ticket.number,
    machineId: ticket.machineId,
    machineName,
    title: ticket.title,
    status: ticket.status,
    createdAt: ticket.createdAt,
    customerEmail: ticket.customerEmail,
    activities: ticket.activities,
    unread: isTicketUnreadForUser(ticket, user),
    viewerReadAt: ticket.lastReadAt[user.id],
    assistantPaused: ticket.assistantPaused,
    assistantEscalatedAt: ticket.assistantEscalatedAt,
  };
  if (user.role === "staff" && options?.customerUsers) {
    base.customerReadReceipts = customerReadReceiptsForTicket(ticket, options.customerUsers);
    const threadCustomerEmail = ticketThreadCounterpartEmail(ticket, options.customerUsers);
    if (threadCustomerEmail) {
      base.threadCustomerEmail = threadCustomerEmail;
    }
  }
  return base;
}

export function usageSummary(
  before: MachineUsage | null,
  after: Pick<MachineUsage, "hours" | "cycles" | "lastServiceAt" | "notes">,
) {
  const parts: string[] = [];
  if (after.hours !== before?.hours) {
    parts.push(
      before?.hours == null
        ? `Set hours to ${after.hours ?? "—"}`
        : `Hours ${before.hours} → ${after.hours ?? "—"}`,
    );
  }
  if (after.cycles !== before?.cycles) {
    parts.push(
      before?.cycles == null
        ? `Set cycles to ${after.cycles ?? "—"}`
        : `Cycles ${before.cycles} → ${after.cycles ?? "—"}`,
    );
  }
  if (after.lastServiceAt !== before?.lastServiceAt) {
    parts.push(
      after.lastServiceAt
        ? `Last service ${after.lastServiceAt}`
        : "Cleared last service",
    );
  }
  if ((after.notes ?? "") !== (before?.notes ?? "")) {
    parts.push(after.notes?.trim() ? "Updated notes" : "Cleared notes");
  }
  return parts.join(" · ") || "Updated service";
}

export function usageHistoryEntry(
  actorEmail: string,
  summary: string,
  at = new Date().toISOString(),
): UsageHistoryEntry {
  return {
    id: `usage-${at}`,
    at,
    actorEmail,
    summary,
  };
}

/** First human note on the ticket — usually the reason the customer opened it. */
export function ticketContextLine(
  ticket: Pick<ServiceTicket, "activities" | "title">,
): string | null {
  for (const activity of ticket.activities) {
    if (activity.kind !== "message") {
      continue;
    }
    const text = activity.text?.trim();
    if (!text || text === ticket.title.trim()) {
      continue;
    }
    const line = displayChatMessageText(text).trim();
    if (!line) {
      continue;
    }
    return line;
  }
  return null;
}

/**
 * Ticket header blurb — omit when the thread already carries the opening note
 * (duplicate render; storage stays one first message activity).
 */
export function ticketHeaderContextLine(
  ticket: Pick<ServiceTicket, "activities" | "title">,
): string | null {
  const hasOpeningMessage = ticket.activities.some(
    (activity) => activity.kind === "message" && activity.text?.trim(),
  );
  if (hasOpeningMessage) {
    return null;
  }
  return ticketContextLine(ticket);
}

/** Plant contact for staff thread chrome — not the staff opener on probe tickets. */
export function ticketThreadCounterpartEmail(
  ticket: Pick<ServiceTicketRecord, "activities" | "customerEmail" | "customerId">,
  customerUsers?: readonly Pick<PublicUser, "id" | "email" | "role">[],
): string | undefined {
  for (const activity of ticket.activities) {
    if (activity.kind === "message" && activity.actorRole === "customer") {
      return activity.actorEmail;
    }
  }
  const profile = customerUsers?.find(
    (row) => row.id === ticket.customerId && row.role === "customer",
  );
  if (profile?.email) {
    return profile.email;
  }
  const email = ticket.customerEmail?.trim();
  if (email && !email.includes("staff@")) {
    return email;
  }
  return customerUsers?.find((row) => row.role === "customer")?.email;
}

export function ticketRefMatches(
  ticket: { id: string; number?: number },
  ticketId: string,
) {
  return ticket.id === ticketId || String(ticket.number) === String(ticketId);
}

export function ticketHref(machineId: string, ticketId: string) {
  return `/machines/${machineId}/care/tickets/${ticketId}`;
}

export function hubTicketHref(ticketId: string) {
  return `/care/tickets/${ticketId}`;
}

export function hubTicketsHref() {
  return "/care/tickets";
}

export function hubCareHref(tab: "overview" | "tickets" = "overview") {
  return tab === "tickets" ? "/care/tickets" : "/care";
}

export function careHref(
  machineId: string,
  tab: "overview" | "manuals" | "tickets" | "service" = "overview",
) {
  if (tab === "overview") {
    return `/machines/${machineId}/care`;
  }
  return `/machines/${machineId}/care/${tab}`;
}

export function serviceVisitHref(machineId: string, visitId: string) {
  return `${careHref(machineId, "service")}/${visitId}`;
}

export function machineTicketsHref(machineId: string, ticketId?: string) {
  const base = careHref(machineId, "tickets");
  return ticketId ? `${base}/${ticketId}` : base;
}

export function actorOf(user: Pick<PublicUser, "id" | "email" | "role">) {
  return { id: user.id, email: user.email, role: user.role as Role };
}
