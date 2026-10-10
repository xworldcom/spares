import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PartLifecyclePanel } from "@/components/staff/PartLifecyclePanel";
import { LoadingState } from "@/components/states/LoadingState";

export default function StaffPartLifecyclePage() {
  return (
    <RequireAuth role="staff">
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
          <PartLifecyclePanel />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
