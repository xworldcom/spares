import { findUserByEmail } from "./store.ts";
import { messageSenderDisplayName } from "./ui/message-sender-display.ts";

type MessageActor = { kind: string; actorEmail: string };

export async function actorDisplayNamesForActivities(
  activities: readonly MessageActor[],
): Promise<Record<string, string>> {
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
  const map: Record<string, string> = {};
  await Promise.all(
    [...emails].map(async (email) => {
      const user = await findUserByEmail(email);
      map[email] = messageSenderDisplayName({
        email,
        name: user?.name,
      });
    }),
  );
  return map;
}
