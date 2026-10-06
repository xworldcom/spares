import type { Tenant } from "../types/index.ts";

export type HostTicketMailbox = {
  displayAddress: string | null;
  inboundLocalPart: string;
  inboundAddress: string;
};

export type InboundCareMessage = {
  to: string;
  from: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  messageId?: string;
};

export type InboundCareContext = {
  mailbox: { tenantId: string; inboundAddress: string } | null;
  sender: { userId: string } | null;
  replyTicketId: string | null;
};

export type InboundCareDecision =
  | { kind: "framed" }
  | { kind: "drop"; reason: "unknown-mailbox" | "guest" }
  | {
      kind: "create";
      tenantId: string;
      from: string;
      subject: string;
      text: string;
      messageId?: string;
    }
  | {
      kind: "append";
      tenantId: string;
      ticketId: string;
      from: string;
      text: string;
      messageId?: string;
    };

const DISPLAY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_INBOUND_DOMAIN = "tickets.oee360.com";

export function careTicketEmailLive(): boolean {
  const value = process.env.CARE_TICKET_EMAIL_LIVE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function inboundMailDomain(): string {
  const configured = process.env.CARE_INBOUND_DOMAIN?.trim().toLowerCase();
  return configured || DEFAULT_INBOUND_DOMAIN;
}

export function allocateInboundLocalPart(slug: string, taken: ReadonlySet<string>): string {
  const normalized = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized || "host";
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function takenInboundLocalParts(
  tenants: readonly Tenant[],
  exceptTenantId?: string,
): Set<string> {
  const taken = new Set<string>();
  for (const tenant of tenants) {
    if (tenant.deletedAt || tenant.id === exceptTenantId) {
      continue;
    }
    const local = tenant.ticketInboundLocalPart?.trim().toLowerCase();
    if (local) {
      taken.add(local);
    }
  }
  return taken;
}

function mailboxFrom(tenant: Tenant, inboundLocalPart: string): HostTicketMailbox {
  const display = tenant.ticketEmailDisplay?.trim() || null;
  return {
    displayAddress: display,
    inboundLocalPart,
    inboundAddress: `${inboundLocalPart}@${inboundMailDomain()}`,
  };
}

export function hostTicketMailbox(tenant: Tenant): HostTicketMailbox | null {
  const inboundLocalPart = tenant.ticketInboundLocalPart?.trim().toLowerCase() ?? "";
  if (!inboundLocalPart) {
    return null;
  }
  return mailboxFrom(tenant, inboundLocalPart);
}

export function ensureHostTicketMailbox(
  tenant: Tenant,
  taken: ReadonlySet<string>,
): { tenant: Tenant; mailbox: HostTicketMailbox } {
  const existing = hostTicketMailbox(tenant);
  if (existing) {
    const stable =
      tenant.ticketInboundLocalPart === existing.inboundLocalPart
        ? tenant
        : { ...tenant, ticketInboundLocalPart: existing.inboundLocalPart };
    return { tenant: stable, mailbox: hostTicketMailbox(stable) ?? existing };
  }
  const inboundLocalPart = allocateInboundLocalPart(tenant.slug, taken);
  const next: Tenant = { ...tenant, ticketInboundLocalPart: inboundLocalPart };
  return { tenant: next, mailbox: mailboxFrom(next, inboundLocalPart) };
}

export function assignMissingHostTicketMailboxes(tenants: readonly Tenant[]): {
  tenants: Tenant[];
  changed: boolean;
} {
  let changed = false;
  const next: Tenant[] = [];
  for (const tenant of tenants) {
    if (tenant.deletedAt || tenant.ticketInboundLocalPart?.trim()) {
      next.push(tenant);
      continue;
    }
    const ensured = ensureHostTicketMailbox(
      tenant,
      takenInboundLocalParts([...next, ...tenants], tenant.id),
    );
    changed = true;
    next.push(ensured.tenant);
  }
  return { tenants: changed ? next : [...tenants], changed };
}

export function inboundLocalPartsChanged(
  before: readonly Tenant[] | undefined,
  after: readonly Tenant[] | undefined,
): boolean {
  const prior = new Map(
    (before ?? []).map((tenant) => [tenant.id, tenant.ticketInboundLocalPart?.trim() ?? ""]),
  );
  return (after ?? []).some((tenant) => {
    const local = tenant.ticketInboundLocalPart?.trim() ?? "";
    return local !== (prior.get(tenant.id) ?? "");
  });
}

export function parseDisplayTicketEmail(
  raw: unknown,
): { ok: true; address: string | null } | { ok: false; message: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, address: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, message: "Enter a valid display ticket email such as cases@shape.com" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, address: null };
  }
  if (trimmed.length > 254 || !DISPLAY_EMAIL.test(trimmed)) {
    return { ok: false, message: "Enter a valid display ticket email such as cases@shape.com" };
  }
  return { ok: true, address: trimmed.toLowerCase() };
}

export function outboundCareHeaders(mailbox: HostTicketMailbox): { replyTo: string | undefined } {
  return { replyTo: mailbox.displayAddress ?? mailbox.inboundAddress };
}

function readInboundEmail(
  value: unknown,
  label: "to" | "from",
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: `Inbound ${label} must be an email address` };
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254 || !DISPLAY_EMAIL.test(trimmed)) {
    return { ok: false, message: `Inbound ${label} must be an email address` };
  }
  return { ok: true, value: trimmed };
}

function readInboundText(
  value: unknown,
  label: "subject" | "text" | "inReplyTo" | "messageId",
  required: boolean,
): { ok: true; value?: string } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    if (required) {
      return { ok: false, message: `Inbound ${label} must be text` };
    }
    return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false, message: `Inbound ${label} must be text` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return required ? { ok: true, value: "" } : { ok: true };
  }
  return { ok: true, value: trimmed };
}

export function parseInboundCarePayload(
  body: unknown,
): { ok: true; payload: InboundCareMessage } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Inbound payload must be a JSON object" };
  }
  const row = body as Record<string, unknown>;
  const to = readInboundEmail(row.to, "to");
  if (!to.ok) {
    return to;
  }
  const from = readInboundEmail(row.from, "from");
  if (!from.ok) {
    return from;
  }
  if (!("subject" in row)) {
    return { ok: false, message: "Inbound subject must be text" };
  }
  const subject = readInboundText(row.subject, "subject", true);
  if (!subject.ok) {
    return subject;
  }
  if (!("text" in row)) {
    return { ok: false, message: "Inbound text must be text" };
  }
  const text = readInboundText(row.text, "text", true);
  if (!text.ok) {
    return text;
  }
  const inReplyTo = readInboundText(row.inReplyTo, "inReplyTo", false);
  if (!inReplyTo.ok) {
    return inReplyTo;
  }
  const messageId = readInboundText(row.messageId, "messageId", false);
  if (!messageId.ok) {
    return messageId;
  }
  return {
    ok: true,
    payload: {
      to: to.value,
      from: from.value,
      subject: subject.value ?? "",
      text: text.value ?? "",
      ...(inReplyTo.value ? { inReplyTo: inReplyTo.value } : {}),
      ...(messageId.value ? { messageId: messageId.value } : {}),
    },
  };
}

export function inboundCareHttpResult(
  body: unknown,
):
  | { status: 200; body: { live: false; framed: true } }
  | { status: 400; body: { error: string } }
  | { status: 503; body: { live: false; error: "inbound-not-wired" } } {
  const parsed = parseInboundCarePayload(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.message } };
  }
  const decision = decideInboundCareAction(parsed.payload);
  if (decision.kind === "framed") {
    return { status: 200, body: { live: false, framed: true } };
  }
  return { status: 503, body: { live: false, error: "inbound-not-wired" } };
}

export function decideInboundCareAction(
  payload: InboundCareMessage,
  context: InboundCareContext = {
    mailbox: null,
    sender: null,
    replyTicketId: null,
  },
): InboundCareDecision {
  if (!careTicketEmailLive()) {
    return { kind: "framed" };
  }
  const mailbox = context.mailbox;
  if (!mailbox || mailbox.inboundAddress.trim().toLowerCase() !== payload.to.trim().toLowerCase()) {
    return { kind: "drop", reason: "unknown-mailbox" };
  }
  if (!context.sender?.userId) {
    return { kind: "drop", reason: "guest" };
  }
  if (context.replyTicketId) {
    return {
      kind: "append",
      tenantId: mailbox.tenantId,
      ticketId: context.replyTicketId,
      from: payload.from,
      text: payload.text,
      ...(payload.messageId ? { messageId: payload.messageId } : {}),
    };
  }
  return {
    kind: "create",
    tenantId: mailbox.tenantId,
    from: payload.from,
    subject: payload.subject,
    text: payload.text,
    ...(payload.messageId ? { messageId: payload.messageId } : {}),
  };
}
