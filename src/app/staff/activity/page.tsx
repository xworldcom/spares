import { RequireAuth } from "@/components/auth/RequireAuth";
import { ActivityLog } from "@/components/staff/ActivityLog";

export default function StaffActivityLogPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Activity Log</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            In-depth record of every account action on this host. Staff can review it
            live. Entries stay on file and cannot be deleted.
          </p>
        </div>
        <ActivityLog />
      </div>
    </RequireAuth>
  );
}