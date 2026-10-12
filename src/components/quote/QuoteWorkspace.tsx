"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DocumentTitle } from "@/components/nav/DocumentTitle";
import { MachineContextNav } from "@/components/nav/MachineContextNav";
import { ConversationSheet } from "@/components/chat/ConversationSheet";
import { useQuoteConversationDockStage } from "@/components/machine/useDesktopStage";
import { QuoteActivityFeed } from "@/components/quote/QuoteActivityFeed";
import { conversationPeekLine } from "@/lib/ui/conversation-peek";
import { conversationThreadSubtitle } from "@/lib/ui/conversation-thread-subtitle";
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
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { errorMessage } from "@/lib/api/errors";
import { quotesListQueryString } from "@/lib/quotes-list-filter";
import {
  getQuote,
  postQuoteActivity,
  setQuoteAssistantPaused,
  updateQuote,
  uploadQuotePo,
} from "@/lib/api/quotes";
import { RecordConflictBanner } from "@/components/record/RecordConflictBanner";
import { isRecordConflictError } from "@/lib/api/record-conflict";
import { useConversationWatch } from "@/lib/hooks/useConversationWatch";
import { useQuoteReadWatermark } from "@/lib/hooks/useQuoteReadWatermark";
import { useRecordFreshnessPoll } from "@/lib/hooks/useRecordFreshnessPoll";
import { quoteRecordEtag } from "@/lib/record-etag";
import { mergeActivitiesById } from "@/lib/merge-activities";
import {
  QUOTE_STATUS_LABELS,
  quoteFulfillmentVisibility,
  pricesVisibleToCustomer,
  quoteIsStaffReadOnly,
  quoteItemsEqual,
  quotePricingComplete,
  quoteRegressionCleanupPatch,
  quoteStaffPricingLocked,
  quoteStatusRegressionSteps,
  quoteTitle,
  invoiceVisible,
} from "@/lib/quotes";
import { quoteSeedForRef } from "@/lib/nav/quote-list-seed";
import {
  QUOTE_REQUESTED_QUERY,
  quoteRequestedBannerText,
} from "@/lib/ui/quote-requested-banner";
import { UNSAVED_QUOTE_LEAVE_PROMPT } from "@/lib/ui/pending-send-guard";
import { useRequestGeneration } from "@/lib/ui/request-generation";
import { useLeavePageGuard } from "@/lib/ui/use-leave-page-guard";
import { releaseWarmReadIfPending } from "@/lib/api/warm-read";
import type {
  Quote,
  QuoteItem,
  QuoteShipment,
  QuoteStatus,
  Role,
  TicketCustomerReadReceipt,
} from "@/types";

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
  initialQuote,
}: {
  quoteRef: string;
  role: Role;
  initialQuote?: Quote | null;
}) {
  const { user } = useAuth();
  const { refresh } = useQuoteAlerts();
  const quoteConversationDock = useQuoteConversationDockStage();
  const inlineMessages = quoteConversationDock;
  const searchParams = useSearchParams();
  const seedQuote = quoteSeedForRef(quoteRef);
  const [quote, setQuote] = useState<Quote | null>(
    () => initialQuote ?? seedQuote ?? null,
  );
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [shipments, setShipments] = useState<QuoteShipment[]>([]);
  const [loadedRef, setLoadedRef] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<QuoteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [statusRegressConfirm, setStatusRegressConfirm] = useState<{
    target: QuoteStatus;
    steps: number;
  } | null>(null);
  const [itemsTouched, setItemsTouched] = useState(false);
  const [pricingPreviewActive, setPricingPreviewActive] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState("");
  const [recordConflict, setRecordConflict] = useState<string | null>(null);
  const [freshnessError, setFreshnessError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const runLock = useRef<Promise<void>>(Promise.resolve());
  const { begin, isCurrent } = useRequestGeneration();

  useEffect(() => {
    if (role !== "customer") {
      return;
    }
    if (searchParams.get(QUOTE_REQUESTED_QUERY) !== "1") {
      return;
    }
    setNotice(quoteRequestedBannerText());
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete(QUOTE_REQUESTED_QUERY);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
  }, [role, searchParams]);

  function applyQuote(next: Quote) {
    setQuote(next);
    setItems(next.items);
    setShipments(draftShipmentsFrom(next));
    setPendingStatus(null);
    setItemsTouched(false);
    setInvoiceDraft(next.invoiceNumber ?? "");
    setLoadedRef(quoteRef);
    void refresh();
  }

  useEffect(() => {
    setPendingStatus(null);
    setError(null);
    setNotice(null);
    const seed = initialQuote ?? quoteSeedForRef(quoteRef);
    if (seed) {
      setQuote(seed);
      setItems(seed.items);
      setShipments(draftShipmentsFrom(seed));
      setLoadedRef(quoteRef);
    } else {
      setQuote(null);
      setItems([]);
      setShipments([]);
      setLoadedRef(null);
    }
    const generation = begin();
    getQuote(quoteRef)
      .then((next) => {
        if (!isCurrent(generation)) {
          return;
        }
        applyQuote(next);
        setError(null);
        setFreshnessError(null);
      })
      .catch((cause: unknown) => {
        if (!isCurrent(generation)) {
          return;
        }
        const message = errorMessage(cause, "Could not load this quote.");
        if (seed) {
          setFreshnessError(message);
        } else {
          setError(message);
          setQuote(null);
        }
        setLoadedRef(quoteRef);
      });
    return () => {
      releaseWarmReadIfPending(`quote:${quoteRef}:view`);
    };
    // applyQuote is local state wiring, not an effect input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuote, quoteRef, loadAttempt, begin, isCurrent]);

  const pollQuote = useCallback(async () => {
    if (!quote) {
      return;
    }
    const staffStatusDirty =
      role === "staff" &&
      pendingStatus !== null &&
      pendingStatus !== quote.status;
    const staffItemsDirty =
      role === "staff" && !quoteItemsEqual(items, quote.items);
    if (staffStatusDirty || staffItemsDirty) {
      return;
    }
    const next = await getQuote(quoteRef);
    const { activities, changed } = mergeActivitiesById(quote.activities, next.activities);
    const itemsChanged = !quoteItemsEqual(quote.items, next.items);
    const touched =
      changed ||
      quote.status !== next.status ||
      itemsChanged ||
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
        items: next.items,
        activities,
        unread: next.unread,
        customerReadReceipts: next.customerReadReceipts,
        assistantPaused: next.assistantPaused,
        assistantAvailable: next.assistantAvailable,
        recordVersion: next.recordVersion,
        lastModifiedAt: next.lastModifiedAt,
        lastModifiedByName: next.lastModifiedByName,
        staffPricingUnlocked: next.staffPricingUnlocked,
      };
    });
    if (role === "staff") {
      setItems(next.items);
    }
  }, [items, pendingStatus, quote, quoteRef, refresh, role]);

  const threadBump =
    quote?.activities.at(-1)?.at ?? quote?.activities.at(-1)?.id ?? quoteRef;
  const conversationReady = Boolean(quote && user && loadedRef === quoteRef);
  const watermarkReady = conversationReady;
  useQuoteReadWatermark(watermarkReady, quote?.id ?? quoteRef, threadBump);

  useConversationWatch(
    conversationReady,
    quote ? { kind: "quote", id: quote.id } : null,
    pollQuote,
  );

  useRecordFreshnessPoll(
    conversationReady,
    quote ? `/api/quotes/${quote.id}` : null,
    quote ? quoteRecordEtag(quote) : null,
    pollQuote,
    setFreshnessError,
  );

  useEffect(() => {
    return () => {
      void refresh();
    };
  }, [refresh]);

  const statusDirtyForGuard =
    pendingStatus !== null && quote != null && pendingStatus !== quote.status;
  const itemsDirtyForGuard =
    quote != null && !quoteItemsEqual(items, quote.items);
  const unsavedStaffChanges =
    role === "staff" &&
    !busy &&
    quote != null &&
    loadedRef === quoteRef &&
    (statusDirtyForGuard || (itemsTouched && itemsDirtyForGuard));
  useLeavePageGuard(unsavedStaffChanges, UNSAVED_QUOTE_LEAVE_PROMPT);

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
      if (isRecordConflictError(cause)) {
        setRecordConflict(cause.message);
        return false;
      }
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
          onRetry={() => {
            setError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        />
      );
    }
    return (
      <div
        className="quote-workspace mx-auto w-full max-w-5xl space-y-5 px-1 py-2"
        aria-busy="true"
        aria-label="Loading quote"
      >
        <div className="catalog-skeleton h-8 w-48 rounded-2xl" />
        <div className="catalog-skeleton h-24 w-full rounded-[22px]" />
        <div className="catalog-skeleton h-32 w-full rounded-[22px]" />
        <div className="catalog-skeleton h-40 w-full rounded-[22px]" />
      </div>
    );
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
  const threadSubtitle =
    threadReady && quoteConversationDock
      ? conversationThreadSubtitle(role, {
          customerEmail: quote.customerEmail,
          machineName: quote.machineName,
        })
      : null;

  const listHrefBase = role === "staff" ? "/staff/quotes" : "/quotes";
  const listHref = `${listHrefBase}${quotesListQueryString(searchParams)}`;
  const displayStatus = pendingStatus ?? quote.status;
  const showPrices = role === "staff" || pricesVisibleToCustomer(quote.status);
  const fulfillment = quoteFulfillmentVisibility(quote, role, displayStatus);
  const readyShipments = shipments.filter((row) => row.trackingNumber.trim());
  const staleInvoice =
    role === "staff" &&
    Boolean(quote.invoiceNumber?.trim()) &&
    !invoiceVisible(displayStatus);
  const statusDirty = pendingStatus !== null && pendingStatus !== quote.status;
  const itemsDirty = itemsTouched && !quoteItemsEqual(items, quote.items);
  const staffReadOnly =
    role === "staff" && quoteIsStaffReadOnly(quote.status);
  const pricingLocked =
    role === "staff" && quoteStaffPricingLocked(quote);
  const staffApplyDirty = statusDirty || itemsDirty || pricingPreviewActive;
  const quoteRecordVersion = quote.recordVersion ?? 1;
  function withQuoteVersion<T extends object>(patch: T) {
    return { ...patch, recordVersion: quoteRecordVersion };
  }

  const primaryLabel =
    statusDirty && itemsDirty
      ? "Apply changes"
      : statusDirty
        ? pendingStatus === "cancelled"
          ? "Cancel quote"
          : "Apply status"
        : "Save pricing";

  async function applyStatusRegression(target: QuoteStatus) {
    if (!quote) {
      return;
    }
    const cleanup = quoteRegressionCleanupPatch(quote.status, target);
    const includeItems =
      itemsDirty || target === "quoted" || target === "pricing";
    const patch = {
      status: target,
      ...cleanup,
      ...(includeItems ? { items } : {}),
    };
    if (target === "po_received" && !quotePricingComplete(items)) {
      setError("Add a sell price on every line before marking PO received.");
      return;
    }
    await run(
      () => updateQuote(String(quote.number), withQuoteVersion(patch)),
      "Status updated.",
    );
    setPendingStatus(null);
    if (cleanup.shipments) {
      setShipments(draftShipmentsFrom({ ...quote, shipments: [] }));
    }
    if (cleanup.invoiceNumber === null) {
      setInvoiceDraft("");
    }
  }

  function applyStaffAction() {
    if (!quote) {
      return;
    }
    if (statusDirty && pendingStatus === "po_received" && !quotePricingComplete(items)) {
      setError("Add a sell price on every line before marking PO received.");
      return;
    }
    if (statusDirty && pendingStatus === "shipped" && readyShipments.length === 0) {
      setError("Add a tracking number to mark this shipped.");
      return;
    }
    if (statusDirty && pendingStatus === "quoted" && !quotePricingComplete(items)) {
      const proceed = window.confirm(
        "Some lines have no sell price. The plant will see a quote with blank prices. Apply anyway?",
      );
      if (!proceed) {
        return;
      }
    }
    if (statusDirty && pendingStatus) {
      const includeItems =
        itemsDirty || pendingStatus === "quoted" || pendingStatus === "pricing";
      const cleanup =
        quoteStatusRegressionSteps(quote.status, pendingStatus) > 0
          ? quoteRegressionCleanupPatch(quote.status, pendingStatus)
          : {};
      const patch =
        pendingStatus === "shipped"
          ? {
              status: pendingStatus,
              shipments: readyShipments,
              ...cleanup,
              ...(includeItems ? { items } : {}),
            }
          : {
              status: pendingStatus,
              ...cleanup,
              ...(includeItems ? { items } : {}),
            };
      void run(
        () => updateQuote(String(quote.number), withQuoteVersion(patch)),
        pendingStatus === "shipped" ? "Marked shipped." : "Status updated.",
      );
      return;
    }
    if (itemsDirty) {
      void run(
        () => updateQuote(String(quote.number), withQuoteVersion({ items })),
        "Pricing saved.",
      ).then((ok) => {
        if (ok) {
          setItemsTouched(false);
        }
      });
    }
  }

  async function unlockStaffPricing() {
    if (!quote) {
      return;
    }
    await run(
      () =>
        updateQuote(String(quote.number), {
          recordVersion: quoteRecordVersion,
          unlockStaffPricing: true,
        }),
      "Pricing unlocked.",
    );
  }

  return (
    <div
      className="quote-workspace mx-auto w-full max-w-5xl"
      data-quote-layout={inlineMessages ? "split" : "stack"}
    >
      <DocumentTitle title={quote ? quoteTitle(quote) : "Quote"} />
      <div className="quote-workspace-main space-y-5">
      <div className="quote-timeline-handoff-dest space-y-5">
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
          editable={role === "staff" && !staffReadOnly}
          pending={busy}
          role={role}
          onChange={(status: QuoteStatus) => {
            setError(null);
            setNotice(null);
            if (
              role === "staff" &&
              status === "cancelled" &&
              quote.status !== "cancelled"
            ) {
              setCancelConfirmOpen(true);
              return;
            }
            const regressSteps = quoteStatusRegressionSteps(quote.status, status);
            if (role === "staff" && regressSteps > 1) {
              setStatusRegressConfirm({ target: status, steps: regressSteps });
              return;
            }
            setPendingStatus(status === quote.status ? null : status);
          }}
        />
        {role === "staff" ? (
          <ConfirmSheet
            open={statusRegressConfirm !== null}
            title="Move this quote backward?"
            message={
              statusRegressConfirm
                ? `This skips ${statusRegressConfirm.steps} stages. Clear invoice and tracking if the plant should not see them at the new stage.`
                : ""
            }
            confirmLabel="Apply status"
            cancelLabel="Keep current status"
            busy={busy}
            onCancel={() => {
              if (!busy) {
                setStatusRegressConfirm(null);
              }
            }}
            onConfirm={() => {
              if (!statusRegressConfirm) {
                return;
              }
              const target = statusRegressConfirm.target;
              setStatusRegressConfirm(null);
              void applyStatusRegression(target);
            }}
          />
        ) : null}
        {role === "staff" ? (
          <ConfirmSheet
            open={cancelConfirmOpen}
            title="Cancel this quote?"
            message="The customer will see this quote as cancelled. Only continue if you mean to cancel it."
            confirmLabel="Cancel quote"
            cancelLabel="Keep quote"
            destructive
            busy={busy}
            onCancel={() => {
              if (!busy) {
                setCancelConfirmOpen(false);
              }
            }}
            onConfirm={() => {
              void run(
                () =>
                  updateQuote(
                    String(quote.number),
                    withQuoteVersion({ status: "cancelled" }),
                  ),
                "Quote cancelled.",
              ).then((ok) => {
                if (ok) {
                  setCancelConfirmOpen(false);
                }
              });
            }}
          />
        ) : null}
      </div>
      {role === "staff" && pricingLocked && !staffReadOnly ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3"
          role="status"
        >
          <p className="text-sm text-[var(--spares-muted)]">
            Pricing is locked after PO received.
            {quote.number === 27 ? " Contact ops to change pricing on this quote." : null}
          </p>
          {quote.number === 27 ? null : (
            <button
              type="button"
              disabled={busy || staffReadOnly}
              onClick={() => void unlockStaffPricing()}
              className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
            >
              Edit pricing
            </button>
          )}
        </div>
      ) : null}
      {role === "staff" && staffApplyDirty ? (
        <div
          className="quote-staff-apply hidden flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8c27a]/25 bg-[color-mix(in_srgb,var(--spares-paper)_92%,#e8c27a_8%)] px-4 py-3 sm:flex"
          role="status"
        >
          <p className="text-sm text-[#e8c27a]">
            {statusDirty && itemsDirty
              ? "Unsaved status and pricing."
              : statusDirty && pendingStatus
                ? `Unsaved status (${QUOTE_STATUS_LABELS[pendingStatus]}).`
                : "Unsaved pricing."}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyStaffAction()}
            className="btn-primary inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-30"
          >
            {primaryLabel}
          </button>
        </div>
      ) : null}

      {role === "staff" && statusDirty && pendingStatus === "quoted" && !quotePricingComplete(items) ? (
        <p className="text-sm text-[#e8c27a]" role="status">
          Enter a sell price above zero on every line before quoting, or confirm to apply
          anyway.
        </p>
      ) : null}

      {recordConflict ? (
        <RecordConflictBanner
          message={recordConflict}
          onRefresh={() => {
            setRecordConflict(null);
            void getQuote(quoteRef).then(applyQuote).catch(() => undefined);
          }}
          onDismiss={() => setRecordConflict(null)}
        />
      ) : null}

      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {freshnessError ? (
        <ErrorState
          title="Could not refresh this quote"
          message={freshnessError}
          onRetry={() => {
            setFreshnessError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        />
      ) : null}
      <div className="min-h-[3.25rem]" aria-live="polite">
        {notice && !(role === "staff" && staffApplyDirty) ? (
          <p
            className="spares-surface rounded-2xl px-4 py-3 text-sm font-medium text-[var(--spares-ink)]"
            role="status"
          >
            {notice}
          </p>
        ) : null}
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-[19px] font-semibold tracking-tight">Lines</h2>
        </div>
        <QuoteLines
          items={role === "staff" ? items : quote.items}
          role={role}
          pricesVisible={showPrices}
          editable={role === "staff" && !staffReadOnly}
          pricingEditable={role === "staff" && !staffReadOnly && !pricingLocked}
          onChange={(next) => {
            setNotice(null);
            setItemsTouched(true);
            setItems(next);
          }}
          onPricingPreviewChange={setPricingPreviewActive}
        />
      </section>

      {fulfillment.po ? (
        <QuotePoPanel
          quote={quote}
          role={role}
          busy={busy}
          onSaveNumber={async (poNumber) => {
            await run(
              () => updateQuote(String(quote.number), withQuoteVersion({ poNumber })),
              "PO number saved.",
            );
          }}
          onUpload={async (input) => {
            await run(() => uploadQuotePo(String(quote.number), input), "PO uploaded.");
          }}
        />
      ) : null}

      {staleInvoice ? (
        <section className="spares-surface rounded-[24px] px-5 py-4">
          <h2 className="text-[19px] font-semibold tracking-tight">Invoice on file</h2>
          <p className="spares-muted mt-1 text-sm">
            {quote.invoiceNumber} is stored but hidden at {QUOTE_STATUS_LABELS[displayStatus]}.
          </p>
          <button
            type="button"
            disabled={busy}
            className="btn-soft mt-3 inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
            onClick={() => {
              void run(
                () =>
                  updateQuote(String(quote.number), withQuoteVersion({ invoiceNumber: null })),
                "Invoice cleared.",
              ).then(() => setInvoiceDraft(""));
            }}
          >
            Clear invoice
          </button>
        </section>
      ) : null}

      {fulfillment.invoice ? (
        <section className="spares-surface rounded-[24px] px-5 py-4">
          <h2 className="text-[19px] font-semibold tracking-tight">Invoice</h2>
          {role === "staff" && !staffReadOnly ? (
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                const invoiceNumber = invoiceDraft.trim();
                void run(
                  () =>
                    updateQuote(
                      String(quote.number),
                      withQuoteVersion({
                        invoiceNumber: invoiceNumber || null,
                      }),
                    ),
                  invoiceNumber ? "Invoice saved." : "Invoice cleared.",
                );
              }}
            >
              <input
                name="invoice"
                value={invoiceDraft}
                onChange={(event) => setInvoiceDraft(event.target.value)}
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
          ) : quote.invoiceNumber ? (
            <p className="mt-2 text-sm">{quote.invoiceNumber}</p>
          ) : null}
        </section>
      ) : null}

      {fulfillment.tracking ? (
        <QuoteTrackingPanel
          quote={quote}
          role={role}
          drafts={shipments}
          onDrafts={setShipments}
          busy={busy}
          onSave={() => {
            const patch =
              readyShipments.length === 0
                ? { shipments: [] as QuoteShipment[] }
                : quote.status === "ordered" || quote.status === "confirmed"
                  ? { status: "shipped" as const, shipments: readyShipments }
                  : { shipments: readyShipments };
            void run(
              () => updateQuote(String(quote.number), withQuoteVersion(patch)),
              readyShipments.length === 0 ? "Tracking cleared." : "Tracking saved.",
            );
          }}
        />
      ) : null}

      {role === "staff" && staffApplyDirty ? (
        <div
          className="quote-staff-apply sticky z-20 -mx-4 border-t border-white/8 bg-[color-mix(in_srgb,var(--spares-paper)_94%,transparent)] px-4 py-3 backdrop-blur-md sm:hidden"
          style={{
            bottom: "calc(var(--spares-tabbar) + env(safe-area-inset-bottom, 0px))",
          }}
          role="status"
        >
          <p className="mb-2 text-center text-sm text-[#e8c27a]">
            {statusDirty && itemsDirty
              ? "Unsaved status and pricing."
              : statusDirty && pendingStatus
                ? `Unsaved status (${QUOTE_STATUS_LABELS[pendingStatus]}).`
                : "Unsaved pricing."}
          </p>
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

      <div className="conversation-sheet-spacer" aria-hidden="true" />

      <ConversationSheet
        title="Messages"
        peekLine={peek.text}
        unread={quote.unread}
        threadKey={loadedRef === quoteRef ? quote.id : quoteRef}
        layout={inlineMessages ? "inline" : "overlay"}
        closeProfile="quote"
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
          layout={inlineMessages ? "card" : "sheet"}
          title="Messages"
          subtitle={inlineMessages ? threadSubtitle ?? undefined : undefined}
          customerReadReceipts={role === "staff" ? quote.customerReadReceipts : undefined}
          actorDisplayNames={quote.actorDisplayNames}
          assistantAvailable={role === "staff" ? quote.assistantAvailable : undefined}
          assistantPaused={quote.assistantPaused}
          onAssistantPausedChange={role === "staff" ? onAssistantPaused : undefined}
        />
      </ConversationSheet>
    </div>
  );
}
