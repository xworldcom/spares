import { RequireAuth } from "@/components/auth/RequireAuth";
import { LifecycleNotificationsPanel } from "@/components/notifications/LifecycleNotificationsPanel";

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Notifications</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            Part discontinuation alerts for machines you can access.
          </p>
        </div>
        <LifecycleNotificationsPanel />
      </div>
    </RequireAuth>
  );
}
