"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { QuoteActivityFeed } from "@/components/quote/QuoteActivityFeed";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { QuoteLines } from "@/components/quote/QuoteLines";
import { QuotePoPanel } from "@/components/quote/QuotePoPanel";
import { QuoteStatusStrip } from "@/components/quote/QuoteStatusStrip";
import {
  QuoteTrackingPanel,
  draftShipmentsFrom,
} from "@/components/quote/QuoteTrackingPanel";
import { formatDay } from "@/components/quote/quote-format";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { errorMessage } from "@/lib/api/errors";
import {
  getQuote,
  postQuoteActivity,
  updateQuote,
  uploadQuotePo,
} from "@/lib/api/quotes";
import {
  canEditTracking,
  pricesVisibleToCustomer,
  quoteTitle,
} from "@/lib/quotes";
import type { Quote, QuoteItem, QuoteShipment, QuoteStatus, Role } from "@/types";

export function QuoteWorkspace({
  quoteRef,
  role,
}: {
  quoteRef: string;
  role: Role;
}) {
  const { user } = useAuth();
  const { refresh } = useQuoteAlerts();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [shipments, setShipments] = useState<QuoteShipment[]>([]);
  const [loadedRef, setLoadedRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loading = loadedRef !== quoteRef;

  function applyQuote(next: Quote) {
    setQuote(next);
    setItems(next.items);
    setShipments(draftShipmentsFrom(next));
    setLoadedRef(quoteRef);
    void refresh();
  }

  useEffect(() => {
    let cancelled = false;
    getQuote(quoteRef)
      .then((next) => {
        if (cancelled) {
          return;
        }
        applyQuote(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load this quote."));
        setLoadedRef(quoteRef);
      });
    return () => {
      cancelled = true;
    };
    // applyQuote is local state wiring, not an effect input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteRef]);

  async function run(action: () => Promise<Quote>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      applyQuote(await action());
      if (success) {
        setNotice(success);
      }
    } catch (cause) {
      setError(errorMessage(cause, "Could not update this quote."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading quote…" />;
  }

  if (error && !quote) {
    return (
      <ErrorState
        title="Quote unavailable"
        message={error}
      />
    );
  }

  if (!quote || !user) {
    return null;
  }

  const listHref = role === "staff" ? "/staff/quotes" : "/quotes";
  const showPrices = role === "staff" || pricesVisibleToCustomer(quote.status);
  const readyShipments = shipments.filter((row) => row.trackingNumber.trim());

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href={listHref}
          className="spares-muted inline-flex h-11 items-center text-sm font-medium"
        >
          ← Quotes
        </Link>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight">
          {quoteTitle(quote)}
        </h1>
        <p className="spares-muted mt-1 text-sm">
          {formatDay(quote.createdAt)}
          {role === "staff" ? ` · ${quote.customerEmail}` : ""}
          {quote.note ? ` · ${quote.note}` : ""}
        </p>
      </div>

      <QuoteStatusStrip
        status={quote.status}
        editable={role === "staff"}
        pending={busy}
        onChange={(status: QuoteStatus) => {
          if (status === "shipped") {
            if (readyShipments.length === 0) {
              setError("Add a tracking number to mark this shipped.");
              return;
            }
            void run(
              () => updateQuote(String(quote.number), { status, shipments: readyShipments }),
              "Marked shipped.",
            );
            return;
          }
          void run(() => updateQuote(String(quote.number), { status }));
        }}
      />

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-neutral-600" role="status">
          {notice}
        </p>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-[19px] font-semibold tracking-tight">Lines</h2>
          {role === "staff" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => updateQuote(String(quote.number), { items }),
                  "Pricing saved.",
                )
              }
              className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-30"
            >
              Save pricing
            </button>
          ) : null}
        </div>
        <QuoteLines
          items={role === "staff" ? items : quote.items}
          role={role}
          pricesVisible={showPrices}
          editable={role === "staff"}
          onChange={setItems}
        />
      </section>

      <QuotePoPanel
        quote={quote}
        role={role}
        busy={busy}
        onSaveNumber={(poNumber) =>
          run(() => updateQuote(String(quote.number), { poNumber }), "PO number saved.")
        }
        onUpload={(input) =>
          run(() => uploadQuotePo(String(quote.number), input), "PO uploaded.")
        }
      />

      {role === "staff" || quote.shipments.length > 0 || canEditTracking(quote.status) ? (
        <QuoteTrackingPanel
          quote={quote}
          role={role}
          drafts={shipments}
          onDrafts={setShipments}
          busy={busy}
          onSave={() => {
            if (readyShipments.length === 0) {
              setError("Add a tracking number.");
              return;
            }
            const patch =
              quote.status === "ordered" || quote.status === "confirmed"
                ? { status: "shipped" as const, shipments: readyShipments }
                : { shipments: readyShipments };
            void run(
              () => updateQuote(String(quote.number), patch),
              "Tracking saved.",
            );
          }}
        />
      ) : null}

      <QuoteActivityFeed
        activities={quote.activities}
        role={role}
        selfEmail={user.email}
        busy={busy}
        onSend={(text) =>
          run(() => postQuoteActivity(String(quote.number), text))
        }
      />
    </div>
  );
}
