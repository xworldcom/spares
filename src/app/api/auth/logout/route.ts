import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { json } from "@/lib/http";
import { revokeUserSessions } from "@/lib/store";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await revokeUserSessions(user.id);
    if (user.tenantId) {
      await recordAccountActivity({
        tenantId: user.tenantId,
        actor: actorFromUser(user),
        action: "auth.logout",
        summary: `${user.email} signed out.`,
      });
    }
  }
  await clearSessionCookie();
  return json({ ok: true });
}
