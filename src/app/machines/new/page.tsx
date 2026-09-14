import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { UploadPackForm } from "@/components/machine/UploadPackForm";

export default function UploadPackPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Upload pack</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            Add a 3D model and parts list for a machine. Using SolidWorks? Start
            with the macro below.
          </p>
        </div>
        <Suspense>
          <UploadPackForm />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
