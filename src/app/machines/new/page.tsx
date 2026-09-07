import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { UploadPackForm } from "@/components/machine/UploadPackForm";

export default function UploadPackPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Upload pack</h1>
          <p className="spares-muted mt-1 text-sm">
            Add a GLB and parts list for a machine. SolidWorks? Start with the
            macro below.
          </p>
        </div>
        <Suspense>
          <UploadPackForm />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
