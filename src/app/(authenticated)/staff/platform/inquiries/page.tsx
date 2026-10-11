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
        </div>
        <PlatformInquiriesList />
      </div>
    </RequireAuth>
  );
}
