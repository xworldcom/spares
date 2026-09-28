"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MachineContextNav } from "@/components/nav/MachineContextNav";
import { ConversationSheet } from "@/components/chat/ConversationSheet";
import { useDesktopStage } from "@/components/machine/useDesktopStage";
import { QuoteActivityFeed } from "@/components/quote/QuoteActivityFeed";
import { conversationPeekLine } from "@/lib/ui/conversation-peek";
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
  setQuoteAssistantPaused,
  updateQuote,
  uploadQuotePo,
} from "@/lib/api/quotes";
import { useConversationWatch } from "@/lib/hooks/useConversationWatch";
import { useQuoteReadWatermark } from "@/lib/hooks/useQuoteReadWatermark";
import { mergeActivitiesById } from "@/lib/merge-activities";
import {
  canEditTracking,
  invoiceVisible,
  pricesVisibleToCustomer,
  quotePricingComplete,
  quoteTitle,
} from "@/lib/quotes";
import { quoteSeedForRef } from "@/lib/nav/quote-list-seed";
import type { Quote, QuoteItem, QuoteShipment, QuoteStatus, Role, TicketCustomerReadReceipt } from "@/types";

function sameReadReceipts(
  a: TicketCustomerReadReceipt[] | undefined,
  b: TicketCustomerReadReceipt[] | undefined,
) {
  if (!a?.length && !b?.length) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every(
    (row, index) =>
      row.userId === b[index]?.userId && row.readAt === b[index]?.readAt,
  );
}

export function QuoteWorkspace({
  quoteRef,
  role,
}: {
  quoteRef: string;
  role: Role;
}) {
  const { user } = useAuth();
  const { refresh } = useQuoteAlerts();
  const desktop = useDesktopStage();
  const seedQuote = quoteSeedForRef(quoteRef);
  const [quote, setQuote] = useState<Quote | null>(() => seedQuote ?? null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [shipments, setShipments] = useState<QuoteShipment[]>([]);
  const [loadedRef, setLoadedRef] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<QuoteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    const seed = quoteSeedForRef(quoteRef);
    if (seed) {
      setQuote(seed);
      setItems(seed.items);
      setShipments(draftShipmentsFrom(seed));
    }
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

  const pollQuote = useCallback(async () => {
    if (!quote || pendingStatus !== null) {
      return;
    }
    if (JSON.stringify(items) !== JSON.stringify(quote.items)) {
      return;
    }
    const next = await getQuote(quoteRef);
    const { activities, changed } = mergeActivitiesById(quote.activities, next.activities);
    const touched =
      changed ||
      quote.status !== next.status ||
      quote.unread !== next.unread ||
      quote.assistantPaused !== next.assistantPaused ||
      quote.assistantAvailable !== next.assistantAvailable ||
      !sameReadReceipts(quote.customerReadReceipts, next.customerReadReceipts);
    if (!touched) {
      return;
    }
    void refresh();
    setQuote((current) => {
      if (
        !current ||
        (String(current.number) !== quoteRef && current.id !== quoteRef)
      ) {
        return next;
      }
      return {
        ...current,
        status: next.status,
        activities,
        unread: next.unread,
        customerReadReceipts: next.customerReadReceipts,
        assistantPaused: next.assistantPaused,
        assistantAvailable: next.assistantAvailable,
      };
    });
  }, [items, pendingStatus, quote, quoteRef, refresh]);

  const threadBump =
    quote?.activities.at(-1)?.at ?? quote?.activities.at(-1)?.id ?? quoteRef;
  const conversationReady = Boolean(quote && user && loadedRef === quoteRef);
  const watermarkReady = Boolean(
    conversationReady && user?.role === "customer",
  );
  useQuoteReadWatermark(watermarkReady, quote?.id ?? quoteRef, threadBump);

  useConversationWatch(
    conversationReady,
    quote ? { kind: "quote", id: quote.id } : null,
    pollQuote,
  );

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

  async function sendActivity(input: {
    text: string;
    attachments?: import("@/types").ChatAttachment[];
  }) {
    if (!quote || !user) {
      return;
    }
    await run(() => postQuoteActivity(String(quote.number), input));
  }

  async function onAssistantPaused(paused: boolean) {
    if (!quote) {
      return;
    }
    await run(() => setQuoteAssistantPaused(String(quote.number), paused));
  }

  if (!quote) {
    if (error) {
      return (
        <ErrorState
          title="Quote unavailable"
          message={error}
        />
      );
    }
    return <LoadingState label="Loading quote…" />;
  }

  if (!user) {
    return null;
  }

  const threadReady =
    String(quote.number) === quoteRef || quote.id === quoteRef;

  const peek = threadReady
    ? conversationPeekLine(quote.activities, {
        email: user.email,
        role,
      })
    : { text: "Loading…", unreadHint: false };

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
        "Some lines are missing or have zero sell prices. Customers will see quoted status with blank pricing until you enter a real price on every line. Apply anyway?",
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
    <div
      className="quote-workspace mx-auto w-full max-w-5xl"
      data-quote-layout={desktop ? "split" : "stack"}
    >
      <div className="quote-workspace-main space-y-5">
      <div>
        {quote.machineId ? (
          <div className="machine-context-embed">
            <MachineContextNav
              machineId={quote.machineId}
              machineName={quote.machineName}
              activeTab="quotes"
            />
          </div>
        ) : null}
        <Link
          href={listHref}
          className="spares-muted inline-flex h-11 items-center text-sm font-medium"
        >
          ← All quotes
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
        role={role}
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

      {role === "staff" && statusDirty && pendingStatus === "quoted" && !quotePricingComplete(items) ? (
        <p className="text-sm text-[#e8c27a]" role="status">
          Enter a sell price above zero on every line before quoting, or confirm to apply
          anyway.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="spares-muted text-sm" role="status">
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

      {invoiceVisible(quote.status) ? (
        <section className="spares-surface rounded-[24px] px-5 py-4">
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
                className="spares-field h-12 flex-1 rounded-2xl border-0 px-4 text-[16px] outline-none"
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
            <p className="mt-2 text-sm">
              {quote.invoiceNumber ?? "Invoice number appears here when issued."}
            </p>
          )}
        </section>
      ) : (
        <p className="spares-muted text-sm">Invoice opens after PO is received.</p>
      )}

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

      <div className="conversation-sheet-spacer" aria-hidden="true" />

      {role === "staff" && (statusDirty || itemsDirty) ? (
        <div
          className="quote-staff-apply sticky z-20 -mx-4 border-t border-white/8 bg-[color-mix(in_srgb,var(--spares-paper)_94%,transparent)] px-4 py-3 backdrop-blur-md sm:hidden"
          style={{
            bottom: "calc(var(--spares-tabbar) + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => applyStaffAction()}
            className="btn-primary inline-flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold disabled:opacity-30"
          >
            {primaryLabel}
          </button>
        </div>
      ) : null}
      </div>

      <ConversationSheet
        title="Conversation"
        peekLine={peek.text}
        unread={quote.unread}
        threadKey={quote.id}
        layout={desktop ? "inline" : "overlay"}
      >
        <QuoteActivityFeed
          activities={threadReady ? quote.activities : []}
          role={role}
          selfEmail={user.email}
          viewerReadAt={quote.viewerReadAt}
          busy={busy || !threadReady}
          onSend={sendActivity}
          threadKind="quote"
          threadId={quote.id}
          layout="sheet"
          customerReadReceipts={role === "staff" ? quote.customerReadReceipts : undefined}
          assistantAvailable={role === "staff" ? quote.assistantAvailable : undefined}
          assistantPaused={quote.assistantPaused}
          onAssistantPausedChange={role === "staff" ? onAssistantPaused : undefined}
        />
      </ConversationSheet>
    </div>
  );
}
