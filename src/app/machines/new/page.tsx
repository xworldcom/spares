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
            Drop a GLB and a parts list (JSON or CSV). From SolidWorks, run the{" "}
            <a className="underline" href="/export/README.md">
              Publish to Spares macro
            </a>{" "}
            (
            <a className="underline" href="/export/spares-pack.bas">
              download .bas
            </a>
            ) to build both files in one step.
          </p>
        </div>
        <Suspense>
          <UploadPackForm />
        </Suspense>
      </div>
    </RequireAuth>
  );
}