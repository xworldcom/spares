import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { UploadPackForm } from "@/components/machine/UploadPackForm";

export default function UploadPackPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Upload pack</h1>
        </div>
        <Suspense>
          <UploadPackForm />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
