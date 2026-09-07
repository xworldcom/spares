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
            Drop a GLB and a Total ETO CSV. Instance names like Pump-1 join
            without renaming. Optional SolidWorks macro:{" "}
            <a className="underline" href="/export/spares-pack.bas">
              spares-pack.bas
            </a>
            .
          </p>
        </div>
        <Suspense>
          <UploadPackForm />
        </Suspense>
      </div>
    </RequireAuth>
  );
}