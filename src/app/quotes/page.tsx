import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuotesList } from "@/components/quote/QuotesList";

export default function CustomerQuotesPage() {
  return (
    <RequireAuth role="customer">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Quotes</h1>
          <p className="spares-muted mt-1 text-sm">
            Requested from a machine. Prices and PO upload appear after quoted.
          </p>
        </div>
        <QuotesList role="customer" />
      </div>
    </RequireAuth>
  );
}
