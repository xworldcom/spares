import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { LifecycleNotificationsPanel } from "@/components/notifications/LifecycleNotificationsPanel";
import { LoadingState } from "@/components/states/LoadingState";
import { getCurrentUser } from "@/lib/auth";
import { derivedListEtagForScope } from "@/lib/derived-list-cache";
import { loadLifecycleNotificationsForSession } from "@/lib/lifecycle-notifications-list-server";
import { lifecycleNotificationsScopeKey } from "@/lib/list-scope";
import { tenantIdForUser } from "@/lib/tenant";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const tenantId = user ? tenantIdForUser(user) : null;
  const initialList = await loadLifecycleNotificationsForSession();
  const listEtag =
    user && tenantId
      ? await derivedListEtagForScope(
          lifecycleNotificationsScopeKey(tenantId, user.id, false),
        )
      : null;

  return (
    <RequireAuth>
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Notifications</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            Part discontinuation alerts for machines you can access.
          </p>
        </div>
        <Suspense fallback={<LoadingState label="Loading notifications…" />}>
          <LifecycleNotificationsPanel initialList={initialList} listEtag={listEtag} />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
