import { RequireAuth } from "@/components/auth/RequireAuth";
import { PlatformInquiriesList } from "@/components/staff/PlatformInquiriesList";
import Link from "next/link";

export default function PlatformInquiriesPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <Link className="text-sm text-muted hover:underline" href="/staff/platform">
            ← Hosts
          </Link>
          <h1 className="page-title mt-2">Inquiries</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            Request-access submissions from the public landing page. Review here before inviting
            anyone into the app.
          </p>
        </div>
        <PlatformInquiriesList />
      </div>
    </RequireAuth>
  );
}
