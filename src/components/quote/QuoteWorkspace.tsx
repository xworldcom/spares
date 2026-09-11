"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  quotePricingComplete,
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
  const [pendingStatus, setPendingStatus] = useState<QuoteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loading = loadedRef !== quoteRef;
  const runLock = useRef<Promise<void>>(Promise.resolve());

  function applyQuote(next: Quote) {
    setQuote(next);
    setItems(next.items);
    setShipments(draftShipmentsFrom(next));
    setPendingStatus(null);
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
    let release: () => void = () => {};
    const previous = runLock.current;
    runLock.current = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    await previous;
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
      return false;
    } finally {
      setBusy(false);
      release();
    }
    return true;
  }

  async function sendActivity(text: string) {
    if (!quote || !user) {
      return;
    }
    const tempId = `pending-${Date.now()}`;
    const temp = {
      id: tempId,
      at: new Date().toISOString(),
      actorRole: role,
      actorEmail: user.email,
      kind: "message" as const,
      text,
    };
    setQuote({ ...quote, activities: [...quote.activities, temp] });
    const ok = await run(() => postQuoteActivity(String(quote.number), text));
    if (!ok) {
      setQuote((current) =>
        current
          ? {
              ...current,
              activities: current.activities.filter((row) => row.id !== tempId),
            }
          : current,
      );
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
  const displayStatus = pendingStatus ?? quote.status;
  const statusDirty = pendingStatus !== null && pendingStatus !== quote.status;
  const itemsDirty = JSON.stringify(items) !== JSON.stringify(quote.items);
  const primaryLabel =
    statusDirty && itemsDirty
      ? "Apply changes"
      : statusDirty
        ? pendingStatus === "cancelled"
          ? "Cancel quote"
          : "Apply status"
        : "Save pricing";

  function applyStaffAction() {
    if (!quote) {
      return;
    }
    if (statusDirty && pendingStatus === "shipped" && readyShipments.length === 0) {
      setError("Add a tracking number to mark this shipped.");
      return;
    }
    if (statusDirty && pendingStatus === "quoted" && !quotePricingComplete(items)) {
      const proceed = window.confirm(
        "Some lines are missing sell prices. Customers will see quoted status with blank pricing until you fill them in. Apply anyway?",
      );
      if (!proceed) {
        return;
      }
    }
    if (statusDirty && pendingStatus) {
      const includeItems =
        itemsDirty || pendingStatus === "quoted" || pendingStatus === "pricing";
      const patch =
        pendingStatus === "shipped"
          ? {
              status: pendingStatus,
              shipments: readyShipments,
              ...(includeItems ? { items } : {}),
            }
          : {
              status: pendingStatus,
              ...(includeItems ? { items } : {}),
            };
      void run(
        () => updateQuote(String(quote.number), patch),
        pendingStatus === "shipped" ? "Marked shipped." : "Status updated.",
      );
      return;
    }
    if (itemsDirty) {
      void run(
        () => updateQuote(String(quote.number), { items }),
        "Pricing saved.",
      );
    }
  }

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
        status={displayStatus}
        editable={role === "staff"}
        pending={busy}
        onChange={(status: QuoteStatus) => {
          setError(null);
          setPendingStatus(status);
        }}
      />
      {role === "staff" && statusDirty ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => applyStaffAction()}
          className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-30"
        >
          {primaryLabel}
        </button>
      ) : null}

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
              disabled={busy || !itemsDirty}
              onClick={() =>
                void run(
                  () => updateQuote(String(quote.number), { items }),
                  "Pricing saved.",
                )
              }
              className="btn-primary hidden h-11 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-30 sm:inline-flex"
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
        onSaveNumber={async (poNumber) => {
          await run(() => updateQuote(String(quote.number), { poNumber }), "PO number saved.");
        }}
        onUpload={async (input) => {
          await run(() => uploadQuotePo(String(quote.number), input), "PO uploaded.");
        }}
      />

      <section className="rounded-[24px] bg-white px-5 py-4">
        <h2 className="text-[19px] font-semibold tracking-tight">Invoice</h2>
        {role === "staff" ? (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const invoiceNumber = String(data.get("invoice") ?? "").trim();
              void run(
                () => updateQuote(String(quote.number), { invoiceNumber }),
                "Invoice saved.",
              );
            }}
          >
            <input
              name="invoice"
              defaultValue={quote.invoiceNumber ?? ""}
              placeholder="INV-1042"
              className="h-12 flex-1 rounded-2xl border-0 bg-[#f4f5f7] px-4 text-[16px] outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="btn-primary inline-flex h-12 items-center justify-center rounded-full px-4 text-sm font-semibold"
            >
              Save
            </button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-neutral-800">
            {quote.invoiceNumber ?? "Invoice number appears here when issued."}
          </p>
        )}
      </section>

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
        onSend={sendActivity}
      />

      {role === "staff" ? (
        <div
          className="sticky z-20 -mx-4 border-t border-black/6 bg-[#f4f5f7]/94 px-4 py-3 backdrop-blur-md sm:hidden"
          style={{
            bottom: "calc(var(--spares-tabbar) + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <button
            type="button"
            disabled={busy || (!statusDirty && !itemsDirty)}
            onClick={() => applyStaffAction()}
            className="btn-primary inline-flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold disabled:opacity-30"
          >
            {primaryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
