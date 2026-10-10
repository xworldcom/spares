import { displayNameFromEmail } from "./display-name.ts";
import { initialsFromEmail } from "./initials.ts";

/** Role-like mailbox locals that should not render as a generic job title (e.g. “Staff”). */
const HANDLE_LOCALS = new Set(["staff", "admin", "support", "help", "noreply"]);

export function messageSenderDisplayName(input: {
  email: string;
  name?: string | null;
}): string {
  const stored = input.name?.trim();
  if (stored) {
    return stored;
  }
  const email = input.email.trim();
  const [localRaw, domainRaw] = email.split("@");
  const local = localRaw?.toLowerCase() ?? "";
  const host = domainRaw?.split(".")[0]?.toLowerCase();
  if (local && host && HANDLE_LOCALS.has(local)) {
    return `${local}@${host}`;
  }
  return displayNameFromEmail(email);
}

export function messageSenderInitials(input: {
  email: string;
  name?: string | null;
}): string {
  const display = messageSenderDisplayName(input);
  const named = input.name?.trim();
  if (named) {
    const tokens = named.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      return (tokens[0]!.charAt(0) + tokens[1]!.charAt(0)).toUpperCase();
    }
    if (tokens.length === 1 && tokens[0]!.length >= 2) {
      return tokens[0]!.slice(0, 2).toUpperCase();
    }
  }
  const email = input.email.trim();
  const [localRaw, domainRaw] = email.split("@");
  const local = localRaw ?? "";
  const host = domainRaw?.split(".")[0] ?? "";
  if (local && host && HANDLE_LOCALS.has(local.toLowerCase())) {
    const a = local.match(/[a-zA-Z0-9]/)?.[0] ?? "";
    const b = host.match(/[a-zA-Z0-9]/)?.[0] ?? "";
    if (a && b) {
      return (a + b).toUpperCase();
    }
  }
  if (display.includes("@")) {
    const tokens = display.split(/[@._+\-]+/).filter(Boolean);
    if (tokens.length >= 2) {
      return (tokens[0]!.charAt(0) + tokens[1]!.charAt(0)).toUpperCase();
    }
  }
  return initialsFromEmail(email);
}
