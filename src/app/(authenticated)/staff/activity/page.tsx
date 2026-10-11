import { RequireAuth } from "@/components/auth/RequireAuth";
import { ActivityLog } from "@/components/staff/ActivityLog";
import { ACTIVITY_LOG_ENABLED } from "@/lib/activity-log-public";

export default function StaffActivityLogPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Activity Log</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            {ACTIVITY_LOG_ENABLED
              ? "Sign-ins and changes on this host. Entries stay on file."
              : "Paused. Recording is off."}
          </p>
        </div>
        {ACTIVITY_LOG_ENABLED ? <ActivityLog /> : null}
      </div>
    </RequireAuth>
  );
}