import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  error,
  isErrorResponse,
  json,
  readJson,
  withCatalogConflict,
  withRecordConflict,
} from "@/lib/http";
import { etagMatches, quoteRecordEtag } from "@/lib/record-etag";
import {
  quoteTouchedFieldsFromPatch,
  readRecordVersion,
  recordMetaFromRow,
} from "@/lib/record-meta";
import { getCurrentUser } from "@/lib/auth";
import {
  actorOf,
  machineNameFor,
  publicQuoteForUser,
  requireQuoteAccess,
} from "@/lib/quote-http";
import { canViewQuote } from "@/lib/quotes";
import { tenantIdForUser, userTenantId } from "@/lib/tenant";
import { bumpConversationWatchForCustomerRead } from "@/lib/chat-watch";
import {
  canEditTracking,
  canUploadPo,
  invoiceVisible,
  isQuoteStatus,
  mergeQuoteItems,
  parseQuoteItems,
  parseShipments,
  quoteItemsEqual,
  quotePricingComplete,
  quoteStaffPricingLocked,
  quoteStatusRegressionSteps,
  shippedActivityText,
  statusActivityText,
  trackingUpdatedActivityText,
} from "@/lib/quotes";
import { actorFromUser, recordAccountActivity, shouldRecordView } from "@/lib/activity-log";
import { isWarmConversationRequest } from "@/lib/api/warm-intent";
import { createQuoteActivity, mutateQuote, readQuoteDetailCatalog } from "@/lib/store";
import type { QuoteRecord, QuoteStatus } from "@/types";

type PatchBody = {
  status?: unknown;
  items?: unknown;
  shipments?: unknown;
  poNumber?: unknown;
  invoiceNumber?: unknown;
  recordVersion?: unknown;
  unlockStaffPricing?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return error("Unauthorized", 401);
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return error("Forbidden", 403);
  }

  const warm = isWarmConversationRequest(_request);
  // Read watermarks are debounced on the client (PATCH /read); avoid catalog writes on GET under load.
  const detail = await readQuoteDetailCatalog(id, tenantId, user.id, {
    markRead: false,
  });
  if (!detail) {
    return error("Quote not found", 404);
  }
  if (!canViewQuote(detail.quote, user)) {
    return error("Forbidden", 403);
  }

  const beforeRead = detail.quote.lastReadAt;
  const marked = detail.quote;
  if (!warm && user.role === "customer") {
    await bumpConversationWatchForCustomerRead(
      "quote",
      marked.id,
      beforeRead,
      marked.lastReadAt,
      [user.id],
    );
  }
  if (
    user.role === "staff" &&
    shouldRecordView(`quote.viewed:${user.id}:${marked.id}`)
  ) {
    await recordAccountActivity({
      tenantId,
      actor: actorFromUser(user),
      action: "quote.viewed",
      summary: `${user.email} opened quote #${marked.number}`,
      target: { type: "quote", id: marked.id, label: `#${marked.number}` },
    });
  }
  const publicQuote = await publicQuoteForUser(marked, user, undefined, detail.bundle);
  const etag = quoteRecordEtag(marked);
  if (etagMatches(_request, etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.json(
    { quote: publicQuote },
    { status: 200, headers: { ETag: etag, "Cache-Control": "private, no-store" } },
  );
}

async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const actor = actorOf(access.user);
  const tenantId = userTenantId(access.user);
  const now = () => new Date().toISOString();
  const expectedVersion =
    typeof body.recordVersion === "number" && body.recordVersion >= 1
      ? body.recordVersion
      : readRecordVersion(access.quote);
  const mutationActor = {
    id: access.user.id,
    email: access.user.email,
    name: access.user.name,
  };
  const touchedFields = quoteTouchedFieldsFromPatch(body);
  const quoteLock = {
    base: access.quote,
    expectedVersion,
    touchedFields,
  };
  if (access.user.role === "customer") {
    const poNumber =
      typeof body.poNumber === "string" ? body.poNumber.trim() : "";
    if (!poNumber) {
      return error("Customers can only update the PO number here", 403);
    }
    if (!canUploadPo(access.quote.status, "customer")) {
      return error("PO number can be added after the quote is issued", 403);
    }
    const next = await mutateQuote(
      access.quote.id,
      tenantId,
      (quote) => {
        if (quote.poNumber === poNumber) {
          return quote;
        }
        return {
          ...quote,
          poNumber,
          activities: [
            ...quote.activities,
            createQuoteActivity(actor, "po", `PO number set to ${poNumber}`, now()),
          ],
          lastReadAt: { ...quote.lastReadAt, [actor.id]: now() },
        };
      },
      { actor: mutationActor, lock: quoteLock },
    );
    if (!next) {
      return error("Quote not found", 404);
    }
    await recordAccountActivity({
      tenantId,
      actor: actorFromUser(access.user),
      action: "quote.updated",
      summary: `${access.user.email} set PO number on quote #${next.number}.`,
      target: { type: "quote", id: next.id, label: `#${next.number}` },
      details: { poNumber },
    });
    return json({ quote: await publicQuoteForUser(next, access.user, await machineNameFor(next)) });
  }

  let status: QuoteStatus | undefined;
  if (body.status !== undefined) {
    if (!isQuoteStatus(body.status)) {
      return error("Invalid status", 400);
    }
    status = body.status;
  }

  if (body.unlockStaffPricing === true) {
    if (quoteStaffPricingLocked(access.quote)) {
      const next = await mutateQuote(
        access.quote.id,
        tenantId,
        (quote) => ({
          ...quote,
          staffPricingUnlocked: true,
          activities: [
            ...quote.activities,
            createQuoteActivity(
              actor,
              "pricing",
              "Pricing unlocked for editing.",
              now(),
            ),
          ],
          lastReadAt: { ...quote.lastReadAt, [actor.id]: now() },
        }),
        { actor: mutationActor, lock: quoteLock },
      );
      if (!next) {
        return error("Quote not found", 404);
      }
      return json({ quote: await publicQuoteForUser(next, access.user, await machineNameFor(next)) });
    }
    return json({ quote: await publicQuoteForUser(access.quote, access.user, await machineNameFor(access.quote)) });
  }

  let items = access.quote.items;
  if (body.items !== undefined) {
    if (quoteStaffPricingLocked(access.quote)) {
      return error("Pricing is locked after PO received. Use Edit pricing to unlock.", 400);
    }
    const parsed = parseQuoteItems(body.items, { allowPricing: true });
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }
    const merged = mergeQuoteItems(
      access.quote.items,
      parsed.items,
      Array.isArray(body.items) ? body.items : undefined,
    );
    if (!merged.ok) {
      return error(merged.error, 400);
    }
    items = merged.items;
  }

  let shipments = access.quote.shipments;
  let shipmentsChanged = false;
  if (body.shipments !== undefined) {
    const parsed = parseShipments(body.shipments);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }
    const targetStatus = status ?? access.quote.status;
    const regressing =
      status !== undefined &&
      quoteStatusRegressionSteps(access.quote.status, status) > 0;
    const clearingShipments =
      parsed.shipments.every((row) => !row.trackingNumber.trim()) &&
      access.quote.shipments.some((row) => row.trackingNumber.trim());
    if (
      !canEditTracking(targetStatus) &&
      !regressing &&
      !clearingShipments
    ) {
      return error(
        "Tracking can be changed after PO received and before delivery.",
        400,
      );
    }
    shipments = parsed.shipments.map((row) => ({
      ...row,
      id:
        row.id.startsWith("ship-") || row.id.startsWith("draft-")
          ? randomUUID()
          : row.id,
    }));
    shipmentsChanged = JSON.stringify(shipments) !== JSON.stringify(access.quote.shipments);
  }

  if (status === "shipped" && shipments.length === 0) {
    return error("Add a tracking number to mark this quote shipped", 400);
  }

  if (status === "po_received" && !quotePricingComplete(items)) {
    return error("Add a sell price on every line before marking PO received", 400);
  }

  if (body.invoiceNumber !== undefined) {
    const invoiceAt = status ?? access.quote.status;
    const clearing =
      body.invoiceNumber === null ||
      (typeof body.invoiceNumber === "string" && !body.invoiceNumber.trim());
    if (!clearing && !invoiceVisible(invoiceAt)) {
      return error("Invoice opens after PO is received", 400);
    }
  }

  const next = await mutateQuote(
    access.quote.id,
    tenantId,
    (quote) => {
    let updated: QuoteRecord = { ...quote, items, shipments };
    if (body.invoiceNumber !== undefined) {
      if (body.invoiceNumber === null) {
        const { invoiceNumber: _removed, ...rest } = updated;
        updated = rest as QuoteRecord;
      } else if (typeof body.invoiceNumber === "string") {
        const trimmed = body.invoiceNumber.trim();
        if (trimmed) {
          updated = { ...updated, invoiceNumber: trimmed };
        } else {
          const { invoiceNumber: _removed, ...rest } = updated;
          updated = rest as QuoteRecord;
        }
      }
    }
    const activities = [...quote.activities];
    const stamp = now();

    if (body.items !== undefined && !quoteItemsEqual(items, quote.items)) {
      activities.push(createQuoteActivity(actor, "pricing", "Pricing updated.", stamp));
      updated = { ...updated, staffPricingUnlocked: false };
    }
    if (status && status !== quote.status) {
      if (status === "shipped") {
        activities.push(createQuoteActivity(actor, "shipment", shippedActivityText(shipments), stamp));
      } else {
        activities.push(createQuoteActivity(actor, "status", statusActivityText(status), stamp));
      }
      updated = { ...updated, status };
    } else if (shipmentsChanged) {
      activities.push(
        createQuoteActivity(actor, "shipment", trackingUpdatedActivityText(shipments), stamp),
      );
    }

    return {
      ...updated,
      activities,
      lastReadAt: { ...quote.lastReadAt, [actor.id]: stamp },
    };
  },
    { actor: mutationActor, lock: quoteLock },
  );

  if (!next) {
    return error("Quote not found", 404);
  }

  await recordAccountActivity({
    tenantId,
    actor: actorFromUser(access.user),
    action: "quote.updated",
    summary: `${access.user.email} updated quote #${next.number}.`,
    target: { type: "quote", id: next.id, label: `#${next.number}` },
    details: {
      status: next.status,
      pricing: body.items !== undefined,
      tracking: shipmentsChanged,
    },
  });

  return json({ quote: await publicQuoteForUser(next, access.user, await machineNameFor(next)) });
}

export const PATCH = withCatalogConflict(withRecordConflict("quote", handlePATCH));
