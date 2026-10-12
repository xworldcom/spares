"use client";

import { TRACKING_CARRIERS, canEditTracking } from "@/lib/quotes";
import type { Quote, QuoteShipment, Role, TrackingCarrier } from "@/types";

const inputClass =
  "spares-field h-11 w-full min-w-0 rounded-2xl border-0 px-3 text-[16px] outline-none";

function emptyShipment(): QuoteShipment {
  return { id: `draft-${Date.now()}`, trackingNumber: "" };
}

function shipmentsSignature(rows: QuoteShipment[]) {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      trackingNumber: row.trackingNumber.trim(),
      carrier: row.carrier ?? "",
      trackingUrl: row.trackingUrl ?? "",
    })),
  );
}

export function QuoteTrackingPanel({
  quote,
  role,
  drafts,
  onDrafts,
  busy,
  onSave,
}: {
  quote: Quote;
  role: Role;
  drafts: QuoteShipment[];
  onDrafts: (next: QuoteShipment[]) => void;
  busy: boolean;
  onSave: () => void;
}) {
  const editable = role === "staff" && canEditTracking(quote.status);
  function trackingRowVisible(row: QuoteShipment) {
    const number = row.trackingNumber.trim();
    return Boolean(number) && number.toUpperCase() !== "REMOVED";
  }
  const rows = editable ? drafts : quote.shipments.filter(trackingRowVisible);
  const readyDrafts = drafts.filter((row) => row.trackingNumber.trim());
  const persistedHasTracking = quote.shipments.some((row) => row.trackingNumber.trim());
  const dirty = editable && shipmentsSignature(drafts) !== shipmentsSignature(quote.shipments);
  const canSaveClear = dirty && readyDrafts.length === 0 && persistedHasTracking;
  const canSaveNumbers = dirty && readyDrafts.length > 0;
  const saveDisabled = busy || !dirty || (!canSaveClear && !canSaveNumbers);

  return (
    <section className="spares-surface rounded-[24px] p-5">
      <h2 className="text-[19px] font-semibold tracking-tight">Tracking</h2>
      {role === "staff" && (quote.status === "shipped" || quote.shipments.length > 0) ? (
        <p className="spares-muted mt-1 text-sm">
          Shown to the customer once the quote is marked shipped.
        </p>
      ) : role === "staff" ? (
        <p className="spares-muted mt-1 text-sm">
          Add tracking to mark this shipped. Carrier is optional.
        </p>
      ) : rows.length === 0 ? (
        <p className="spares-muted mt-1 text-sm">
          Tracking numbers appear here once your order ships.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <li key={row.id} className="spares-field rounded-[18px] p-3">
            {editable ? (
              <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <select
                  value={row.carrier ?? ""}
                  onChange={(event) => {
                    const carrier = event.target.value as TrackingCarrier | "";
                    onDrafts(
                      drafts.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, carrier: carrier || undefined }
                          : item,
                      ),
                    );
                  }}
                  className={inputClass}
                >
                  <option value="">Carrier</option>
                  {TRACKING_CARRIERS.map((carrier) => (
                    <option key={carrier} value={carrier}>
                      {carrier}
                    </option>
                  ))}
                </select>
                <input
                  value={row.trackingNumber}
                  onChange={(event) =>
                    onDrafts(
                      drafts.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, trackingNumber: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className={inputClass}
                  placeholder="Tracking number"
                />
                <input
                  value={row.trackingUrl ?? ""}
                  onChange={(event) =>
                    onDrafts(
                      drafts.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, trackingUrl: event.target.value || undefined }
                          : item,
                      ),
                    )
                  }
                  className={`${inputClass} sm:col-span-2`}
                  placeholder="Tracking URL (optional)"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (drafts.length <= 1) {
                      onDrafts([emptyShipment()]);
                      return;
                    }
                    onDrafts(drafts.filter((_, itemIndex) => itemIndex !== index));
                  }}
                  className="spares-muted text-left text-sm sm:col-span-2"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <p className="text-[17px] font-semibold tracking-tight">
                  {row.trackingNumber}
                </p>
                <p className="spares-muted text-sm">{row.carrier ?? "Carrier not set"}</p>
                {row.trackingUrl ? (
                  <a
                    href={row.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex h-11 items-center text-sm font-medium text-[#0a84ff]"
                  >
                    Track package
                  </a>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>

      {editable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onDrafts([...drafts, emptyShipment()])}
            className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
          >
            Add tracking
          </button>
          <button
            type="button"
            disabled={saveDisabled}
            onClick={onSave}
            className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-30"
          >
            {canSaveClear ? "Clear tracking" : "Save tracking"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function draftShipmentsFrom(quote: Quote): QuoteShipment[] {
  const rows = quote.shipments.filter((row) => row.trackingNumber.trim());
  return rows.length > 0 ? rows : [emptyShipment()];
}
