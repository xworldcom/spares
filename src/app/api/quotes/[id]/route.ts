import { randomUUID } from "node:crypto";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { actorOf, machineNameFor, publicQuoteForUser, requireQuoteAccess } from "@/lib/quote-http";
import {
  canEditTracking,
  canUploadPo,
  invoiceVisible,
  isQuoteStatus,
  mergeQuoteItems,
  parseQuoteItems,
  parseShipments,
  quoteItemsEqual,
  shippedActivityText,
  statusActivityText,
  trackingUpdatedActivityText,
} from "@/lib/quotes";
import { userTenantId } from "@/lib/tenant";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { createQuoteActivity, markQuoteRead, mutateQuote } from "@/lib/store";
import type { QuoteRecord, QuoteStatus } from "@/types";

type PatchBody = {
  status?: unknown;
  items?: unknown;
  shipments?: unknown;
  poNumber?: unknown;
  invoiceNumber?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const tenantId = userTenantId(access.user);
  const marked =
    (await markQuoteRead(access.quote.id, tenantId, access.user.id)) ?? access.quote;
  return json({
    quote: await publicQuoteForUser(marked, access.user, await machineNameFor(marked)),
  });
}

export async function PATCH(
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

  if (access.user.role === "customer") {
    const poNumber =
      typeof body.poNumber === "string" ? body.poNumber.trim() : "";
    if (!poNumber) {
      return error("Customers can only update the PO number here", 403);
    }
    if (!canUploadPo(access.quote.status)) {
      return error("PO number can be added after the quote is issued", 403);
    }
    const next = await mutateQuote(access.quote.id, tenantId, (quote) => {
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
    });
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

  let items = access.quote.items;
  if (body.items !== undefined) {
    const parsed = parseQuoteItems(body.items, { allowPricing: true });
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }
    const merged = mergeQuoteItems(access.quote.items, parsed.items);
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
    if (!canEditTracking(targetStatus)) {
      return error("Tracking can be edited until the quote is delivered", 400);
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

  if (typeof body.invoiceNumber === "string") {
    const invoiceAt = status ?? access.quote.status;
    if (!invoiceVisible(invoiceAt)) {
      return error("Invoice opens after PO is received", 400);
    }
  }

  const next = await mutateQuote(access.quote.id, tenantId, (quote) => {
    let updated: QuoteRecord = { ...quote, items, shipments };
    const invoiceNumber =
      typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : quote.invoiceNumber;
    if (invoiceNumber) {
      updated = { ...updated, invoiceNumber };
    }
    const activities = [...quote.activities];
    const stamp = now();

    if (body.items !== undefined && !quoteItemsEqual(items, quote.items)) {
      activities.push(createQuoteActivity(actor, "pricing", "Pricing updated.", stamp));
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
  });

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
