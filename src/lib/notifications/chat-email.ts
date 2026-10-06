import type { Role } from "../../types/index.ts";
import { hostTicketMailbox, outboundCareHeaders } from "../care-ticket-email.ts";
import { listTenants } from "../store.ts";
import { createChatEmailMailer, type ChatEmailMailer } from "./mailer.ts";
import { loadMachineChatNotifyRecipients } from "./recipients.ts";

function careTicketPath(ticketId: string) {
  return `/care/tickets/${ticketId}`;
}

function quotePath(role: Role, quoteNumber: number) {
  return role === "staff" ? `/staff/quotes/${quoteNumber}` : `/quotes/${quoteNumber}`;
}

export type CareChatNotifyContext = {
  kind: "care";
  ticketId: string;
  ticketNumber: number;
  ticketTitle: string;
  machineId: string;
  machineName: string;
};

export type QuoteChatNotifyContext = {
  kind: "quote";
  quoteNumber: number;
  machineId: string;
  machineName: string;
};

export type MachineChatNotifyContext = CareChatNotifyContext | QuoteChatNotifyContext;

export type MachineChatNotifyInput = {
  tenantId: string;
  sender: { id: string; email: string; name?: string };
  text: string;
  attachmentCount: number;
  context: MachineChatNotifyContext;
};

export function chatEmailNotifyEnabled() {
  const value = process.env.CHAT_EMAIL_NOTIFY?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function publicAppOrigin() {
  const explicit = process.env.SPARES_PUBLIC_ORIGIN?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/$/, "")}`;
  }
  return "https://oee360.com";
}

function senderLabel(sender: MachineChatNotifyInput["sender"]) {
  const name = sender.name?.trim();
  if (name) {
    return name;
  }
  return sender.email;
}

function excerpt(text: string, max = 240) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

function conversationPath(role: Role, context: MachineChatNotifyContext) {
  if (context.kind === "care") {
    return careTicketPath(context.ticketId);
  }
  return quotePath(role, context.quoteNumber);
}

async function resolveCareReplyTo(tenantId: string): Promise<string | undefined> {
  const tenants = await listTenants();
  const tenant = tenants.find((row) => row.id === tenantId);
  if (!tenant) {
    return undefined;
  }
  const mailbox = hostTicketMailbox(tenant);
  if (!mailbox) {
    return undefined;
  }
  return outboundCareHeaders(mailbox).replyTo;
}

async function buildEmail(
  recipientRole: Role,
  input: MachineChatNotifyInput,
): Promise<{ subject: string; text: string; replyTo?: string }> {
  const origin = publicAppOrigin();
  const path = conversationPath(recipientRole, input.context);
  const url = `${origin}${path}`;
  const who = senderLabel(input.sender);
  const snippet = excerpt(input.text);
  const attachmentNote =
    input.attachmentCount > 0
      ? `\n\nIncludes ${input.attachmentCount} attachment${input.attachmentCount === 1 ? "" : "s"}.`
      : "";

  if (input.context.kind === "care") {
    const subject = `Care ticket #${input.context.ticketNumber} on ${input.context.machineName}`;
    const text = [
      `${who} posted on Care ticket #${input.context.ticketNumber} (${input.context.ticketTitle}) for ${input.context.machineName}.`,
      "",
      snippet ? `"${snippet}"` : "(No message text)",
      attachmentNote,
      "",
      `Open the conversation: ${url}`,
    ].join("\n");
    return { subject, text, replyTo: await resolveCareReplyTo(input.tenantId) };
  }

  const subject = `Quote #${input.context.quoteNumber} on ${input.context.machineName}`;
  const text = [
    `${who} posted on quote #${input.context.quoteNumber} for ${input.context.machineName}.`,
    "",
    snippet ? `"${snippet}"` : "(No message text)",
    attachmentNote,
    "",
    `Open the conversation: ${url}`,
  ].join("\n");
  return { subject, text };
}

export async function notifyMachineChatUpdate(
  input: MachineChatNotifyInput,
  options?: { mailer?: ChatEmailMailer },
): Promise<{ recipientCount: number; sentCount: number }> {
  if (!chatEmailNotifyEnabled()) {
    return { recipientCount: 0, sentCount: 0 };
  }

  const recipients = await loadMachineChatNotifyRecipients(
    input.tenantId,
    input.context.machineId,
    input.sender,
  );
  if (recipients.length === 0) {
    return { recipientCount: 0, sentCount: 0 };
  }

  const mailer = options?.mailer ?? createChatEmailMailer();
  const builtByRole = new Map<Role, { subject: string; text: string; replyTo?: string }>();
  let sentCount = 0;
  for (const recipient of recipients) {
    let built = builtByRole.get(recipient.role);
    if (!built) {
      built = await buildEmail(recipient.role, input);
      builtByRole.set(recipient.role, built);
    }
    await mailer.send({
      to: recipient.email,
      subject: built.subject,
      text: built.text,
      ...(built.replyTo ? { replyTo: built.replyTo } : {}),
    });
    sentCount += 1;
  }
  return { recipientCount: recipients.length, sentCount };
}
