import { RequireAuth } from "@/components/auth/RequireAuth";
import { UploadPackForm } from "@/components/machine/UploadPackForm";

export default function UploadPackPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Upload pack</h1>
          <p className="spares-muted mt-1 text-sm">
            Name the machine, attach a GLB/GLTF, and provide an ETO-shaped
            parts list (part number, name, qty). Join errors stay visible.
          </p>
        </div>
        <UploadPackForm />
      </div>
    </RequireAuth>
  );
}
