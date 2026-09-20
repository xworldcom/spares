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
              ? "In-depth record of every account action on this host. Staff can review it live. Entries stay on file and cannot be deleted."
              : "Paused. The live list was rewriting private storage on a timer, so recording and this page are off until we turn them back on."}
          </p>
        </div>
        {ACTIVITY_LOG_ENABLED ? <ActivityLog /> : null}
      </div>
    </RequireAuth>
  );
}