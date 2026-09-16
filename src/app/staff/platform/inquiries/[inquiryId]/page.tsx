import { RequireAuth } from "@/components/auth/RequireAuth";
import { PlatformInquiryDetail } from "@/components/staff/PlatformInquiryDetail";

export default function PlatformInquiryDetailPage() {
  return (
    <RequireAuth role="staff">
      <PlatformInquiryDetail />
    </RequireAuth>
  );
}
