import type { Role } from "../../types/index.ts";
import { createChatEmailMailer, type ChatEmailMailer } from "./mailer.ts";
import { lifecycleObsoleteNotifyEnabled } from "../lifecycle-notifications.ts";
import type { StoredUser } from "../store.ts";
import type { NotifyRecipient } from "./recipients.ts";

export function lifecycleEmailNotifyEnabled() {
  const value = process.env.LIFECYCLE_EMAIL_NOTIFY?.trim().toLowerCase();
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

export type PartObsoleteEmailInput = {
  partNumber: string;
  name: string;
  machineNames: string[];
  discontinuationDate?: string;
  successorPartNumber?: string;
  appUrl: string;
  role: Role;
};

export function buildPartObsoleteEmail(input: PartObsoleteEmailInput) {
  const machines =
    input.machineNames.length > 0 ? input.machineNames.join(", ") : "your machines";
  const lines = [
    `Part ${input.partNumber} (${input.name}) is discontinued.`,
    `Used on: ${machines}.`,
  ];
  if (input.discontinuationDate) {
    lines.push(`End date: ${input.discontinuationDate}.`);
  }
  if (input.successorPartNumber) {
    lines.push(`Replacement part: ${input.successorPartNumber}.`);
  }
  lines.push(`Open: ${input.appUrl}`);
  const subject = `Discontinued part: ${input.partNumber}`;
  return {
    subject,
    text: lines.join("\n"),
    html: `<p>${lines.join("</p><p>")}</p>`,
  };
}

export type LifecycleEmailSender = {
  sendPartObsolete(input: {
    to: string;
    role: Role;
    partNumber: string;
    name: string;
    machineNames: string[];
    discontinuationDate?: string;
    successorPartNumber?: string;
  }): Promise<void>;
};

export function createLifecycleEmailMailer(mailer?: ChatEmailMailer): LifecycleEmailSender {
  const transport = mailer ?? createChatEmailMailer();
  return {
    async sendPartObsolete(input) {
      if (!lifecycleEmailNotifyEnabled()) {
        return;
      }
      console.info(JSON.stringify({ tag: "lifecycle-email-notify", to: input.to, partNumber: input.partNumber }));
      const path = input.role === "staff" ? "/staff/parts" : "/part-alerts";
      const appUrl = `${publicAppOrigin()}${path}?q=${encodeURIComponent(input.partNumber)}`;
      const built = buildPartObsoleteEmail({
        partNumber: input.partNumber,
        name: input.name,
        machineNames: input.machineNames,
        discontinuationDate: input.discontinuationDate,
        successorPartNumber: input.successorPartNumber,
        appUrl,
        role: input.role,
      });
      await transport.send({
        to: input.to,
        subject: built.subject,
        text: built.text,
      });
    },
  };
}

export function filterLifecycleEmailRecipients(
  users: StoredUser[],
  recipients: NotifyRecipient[],
) {
  const byId = new Map(users.map((user) => [user.id, user]));
  return recipients.filter((recipient) => {
    const user = byId.get(recipient.userId);
    return user ? lifecycleObsoleteNotifyEnabled(user) : true;
  });
}
