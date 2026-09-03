import { RequireAuth } from "@/components/auth/RequireAuth";
import { BugReportsList } from "@/components/staff/BugReportsList";

export default function StaffBugReportsPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bug reports</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Preview reports from anyone, including the login screen. Screenshots
            are captured without the Report bug sheet.
          </p>
        </div>
        <BugReportsList />
      </div>
    </RequireAuth>
  );
}
