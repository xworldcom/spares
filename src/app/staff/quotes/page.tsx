import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuotesWorkspace } from "@/components/quote/QuotesWorkspace";

export default function StaffQuotesPage() {
  return (
    <RequireAuth role="staff">
      <QuotesWorkspace role="staff" />
    </RequireAuth>
  );
}
