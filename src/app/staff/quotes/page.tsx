import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuotesList } from "@/components/quote/QuotesList";

export default function StaffQuotesPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Quotes</h1>
          <p className="spares-muted mt-1 text-sm">
            Shared workspace with the customer. Price lines, then PO, then ship.
          </p>
        </div>
        <QuotesList role="staff" />
      </div>
    </RequireAuth>
  );
}
