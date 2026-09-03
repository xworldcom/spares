import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuotesInbox } from "@/components/quote/QuotesInbox";

export default function StaffQuotesPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Customer quote requests. No payments, cart, or checkout.
          </p>
        </div>
        <QuotesInbox />
      </div>
    </RequireAuth>
  );
}
