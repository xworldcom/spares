import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RouteDocumentTitle } from "@/components/nav/RouteDocumentTitle";
import { PartLifecyclePanel } from "@/components/staff/PartLifecyclePanel";
import { LoadingState } from "@/components/states/LoadingState";
import { getCurrentUser } from "@/lib/auth";
import { derivedListEtagForScope } from "@/lib/derived-list-cache";
import { partLifecycleListScopeKey } from "@/lib/list-scope";
import { loadStaffPartLifecycleDefaultForSession } from "@/lib/part-lifecycle-list-server";
import { tenantIdForUser } from "@/lib/tenant";

export default async function StaffPartLifecyclePage() {
  const user = await getCurrentUser();
  const tenantId = user ? tenantIdForUser(user) : null;
  const initialList = await loadStaffPartLifecycleDefaultForSession();
  const listEtag =
    tenantId
      ? await derivedListEtagForScope(
          partLifecycleListScopeKey(tenantId, { status: "all" }),
        )
      : null;

  return (
    <RequireAuth role="staff">
      <RouteDocumentTitle title="Parts" />
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Part lifecycle</h1>
          <p className="spares-muted mt-2 max-w-2xl text-[15px] leading-relaxed">
            Every part number on your machines, with obsolescence status in one place.
            Customers see a short note on discontinued or announced parts when they pick
            parts or build a quote.
          </p>
        </div>
        <Suspense fallback={<LoadingState label="Loading parts…" />}>
          <PartLifecyclePanel initialList={initialList} listEtag={listEtag} />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
