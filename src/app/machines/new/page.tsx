import { RequireAuth } from "@/components/auth/RequireAuth";
import { UploadPackForm } from "@/components/machine/UploadPackForm";

export default function UploadPackPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Upload pack</h1>
          <p className="spares-muted mt-1 text-sm">
            Drop a GLB and a BOM. We join part numbers to meshes and keep
            mismatches visible.
          </p>
        </div>
        <UploadPackForm />
      </div>
    </RequireAuth>
  );
}
