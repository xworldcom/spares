import type { Role } from "../../types/index.ts";
import { displayNameFromEmail } from "./display-name.ts";

/** Small “who this thread is with” line — desktop card header only (not sheet chrome). */
export function conversationThreadSubtitle(
  viewerRole: Role,
  input: { customerEmail?: string; machineName?: string },
): string | null {
  if (viewerRole === "staff") {
    const email = input.customerEmail?.trim();
    if (!email) {
      return null;
    }
    const person = displayNameFromEmail(email);
    const machine = input.machineName?.trim();
    return machine ? `${person} · ${machine}` : person;
  }
  return "Spares";
}
