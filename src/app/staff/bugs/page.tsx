import { RequireAuth } from "@/components/auth/RequireAuth";
import { BugReportsList } from "@/components/staff/BugReportsList";

export default function StaffBugReportsPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Bug reports</h1>
        </div>
        <BugReportsList />
      </div>
    </RequireAuth>
  );
}
