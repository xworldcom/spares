import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { BugReportsList } from "@/components/staff/BugReportsList";
import { LoadingState } from "@/components/states/LoadingState";
import { derivedListEtagForScope } from "@/lib/derived-list-cache";
import { loadBugReportsListForSession } from "@/lib/bug-reports-list-server";
import { bugReportsListScopeKey } from "@/lib/list-scope";
import { getCurrentUser } from "@/lib/auth";
import { tenantIdForUser } from "@/lib/tenant";

export default async function StaffBugReportsPage() {
  const user = await getCurrentUser();
  const tenantId = user ? tenantIdForUser(user) : null;
  const initialList = await loadBugReportsListForSession();
  const listEtag =
    tenantId ? await derivedListEtagForScope(bugReportsListScopeKey(tenantId)) : null;

  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Bug reports</h1>
        </div>
        <Suspense fallback={<LoadingState label="Loading bug reports…" />}>
          <BugReportsList initialList={initialList} listEtag={listEtag} />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
