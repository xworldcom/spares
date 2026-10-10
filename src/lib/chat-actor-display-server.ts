import { withCatalogUsersForActorDisplay } from "./store.ts";
import { messageSenderDisplayName } from "./ui/message-sender-display.ts";

type MessageActor = { kind: string; actorEmail: string };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function messageActorEmails(activities: readonly MessageActor[]) {
  const emails = new Set<string>();
  for (const activity of activities) {
    if (activity.kind !== "message") {
      continue;
    }
    const email = activity.actorEmail.trim();
    if (email) {
      emails.add(email);
    }
  }
  return emails;
}

export function actorDisplayNamesFromUsers(
  activities: readonly MessageActor[],
  users: readonly { email: string; name?: string | null }[],
): Record<string, string> {
  const emails = messageActorEmails(activities);
  if (emails.size === 0) {
    return {};
  }
  const byEmail = new Map(
    users.map((user) => [normalizeEmail(user.email), user] as const),
  );
  const map: Record<string, string> = {};
  for (const email of emails) {
    const row = byEmail.get(normalizeEmail(email));
    map[email] = messageSenderDisplayName({
      email,
      name: row?.name,
    });
  }
  return map;
}

/** One catalog read for all message senders (avoids per-email findUserByEmail N+1). */
export async function actorDisplayNamesForActivities(
  activities: readonly MessageActor[],
): Promise<Record<string, string>> {
  const emails = messageActorEmails(activities);
  if (emails.size === 0) {
    return {};
  }
  const users = await withCatalogUsersForActorDisplay();
  return actorDisplayNamesFromUsers(activities, users);
}
