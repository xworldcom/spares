import type {
  PublicUser,
  Quote,
  QuoteActivity,
  QuoteActivityKind,
  QuoteItem,
  QuoteRecord,
  QuoteShipment,
  QuoteStatus,
  Role,
  TrackingCarrier,
} from "@/types";

export const QUOTE_PIPELINE = [
  "requested",
  "in_review",
  "pricing",
  "quoted",
  "po_received",
  "confirmed",
  "ordered",
  "shipped",
  "delivered",
  "closed",
] as const satisfies readonly QuoteStatus[];

export const QUOTE_STATUSES = [
  ...QUOTE_PIPELINE,
  "cancelled",
] as const satisfies readonly QuoteStatus[];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  requested: "Requested",
  in_review: "In review",
  pricing: "Pricing",
  quoted: "Quoted",
  po_received: "PO received",
  confirmed: "Confirmed",
  ordered: "Ordered",
  shipped: "Shipped",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const TRACKING_CARRIERS = [
  "UPS",
  "FedEx",
  "Purolator",
  "Other",
] as const satisfies readonly TrackingCarrier[];

const PO_ELIGIBLE = new Set<QuoteStatus>([
  "quoted",
  "po_received",
  "confirmed",
  "ordered",
  "shipped",
  "delivered",
  "closed",
]);

const PRICE_VISIBLE = new Set<QuoteStatus>([
  "quoted",
  "po_received",
  "confirmed",
  "ordered",
  "shipped",
  "delivered",
  "closed",
]);

const TRACKING_VISIBLE = new Set<QuoteStatus>([
  "shipped",
  "delivered",
  "closed",
]);

export const MAX_ACTIVITY_TEXT = 4000;
export const MAX_PO_BYTES = 10 * 1024 * 1024;
export const MAX_SHIPMENTS = 8;

export type ParseQuoteItemsResult =
  | { ok: true; items: QuoteItem[] }
  | { ok: false; error: string };

export type ParseQuoteItemsOptions = {
  allowPricing?: boolean;
};

export type ParseShipmentsResult =
  | { ok: true; shipments: QuoteShipment[] }
  | { ok: false; error: string };

function asQty(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  return null;
}

function asOptionalString(value: unknown, max = 200): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, max);
}

function asMoney(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function asDays(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseItemRow(
  row: unknown,
  allowPricing: boolean,
): { ok: true; item: QuoteItem } | { ok: false; error: string } {
  if (!row || typeof row !== "object") {
    return { ok: false, error: "each item must be { id, qty }" };
  }
  const record = row as {
    id?: unknown;
    name?: unknown;
    qty?: unknown;
    sellPrice?: unknown;
    unitPrice?: unknown;
    supplierCost?: unknown;
    supplier?: unknown;
    leadTimeDays?: unknown;
    note?: unknown;
  };
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const qty = asQty(record.qty);
  if (!id) {
    return { ok: false, error: "each item needs a part id" };
  }
  if (qty === null) {
    return { ok: false, error: "qty must be an integer ≥ 1" };
  }

  const item: QuoteItem = { id, qty };
  const name = asOptionalString(record.name, 200);
  if (name) {
    item.name = name;
  }

  if (allowPricing) {
    const sellPrice = asMoney(record.sellPrice ?? record.unitPrice);
    if (sellPrice === null) {
      return { ok: false, error: "sellPrice must be a number ≥ 0" };
    }
    if (sellPrice !== undefined) {
      item.sellPrice = sellPrice;
    }
    const supplierCost = asMoney(record.supplierCost);
    if (supplierCost === null) {
      return { ok: false, error: "supplierCost must be a number ≥ 0" };
    }
    if (supplierCost !== undefined) {
      item.supplierCost = supplierCost;
    }
    const leadTimeDays = asDays(record.leadTimeDays);
    if (leadTimeDays === null) {
      return { ok: false, error: "leadTimeDays must be an integer ≥ 0" };
    }
    if (leadTimeDays !== undefined) {
      item.leadTimeDays = leadTimeDays;
    }
    const supplier = asOptionalString(record.supplier, 120);
    if (supplier) {
      item.supplier = supplier;
    }
    const note = asOptionalString(record.note, 500);
    if (note) {
      item.note = note;
    }
  }

  return { ok: true, item };
}

export function parseQuoteItems(
  raw: unknown,
  options: ParseQuoteItemsOptions = {},
): ParseQuoteItemsResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "items must be a non-empty array" };
  }

  const items: QuoteItem[] = [];
  const seen = new Set<string>();
  const allowPricing = options.allowPricing === true;

  for (const row of raw) {
    const parsed = parseItemRow(row, allowPricing);
    if (!parsed.ok) {
      return parsed;
    }
    if (seen.has(parsed.item.id)) {
      return { ok: false, error: "duplicate part id in items" };
    }
    seen.add(parsed.item.id);
    items.push(parsed.item);
  }

  return { ok: true, items };
}

export function quoteItemsEqual(left: QuoteItem[], right: QuoteItem[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }
    return (
      item.id === other.id &&
      item.qty === other.qty &&
      item.name === other.name &&
      item.sellPrice === other.sellPrice &&
      item.supplierCost === other.supplierCost &&
      item.supplier === other.supplier &&
      item.leadTimeDays === other.leadTimeDays &&
      item.note === other.note
    );
  });
}

export function mergeQuoteItems(
  existing: QuoteItem[],
  patch: QuoteItem[],
): ParseQuoteItemsResult {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const row of patch) {
    if (!byId.has(row.id)) {
      return { ok: false, error: "cannot add a part that was not on this quote" };
    }
  }
  const next = existing.map((item) => {
    const overlay = patch.find((row) => row.id === item.id);
    if (!overlay) {
      return item;
    }
    return normalizeItem({
      ...item,
      ...overlay,
      id: item.id,
    });
  });
  return { ok: true, items: next };
}

function normalizeItem(item: QuoteItem & { unitPrice?: number }): QuoteItem {
  const qty =
    typeof item.qty === "number" && item.qty >= 1 ? Math.floor(item.qty) : 1;
  const next: QuoteItem = { id: item.id, qty };
  if (typeof item.name === "string" && item.name.trim()) {
    next.name = item.name.trim();
  }
  const sell =
    typeof item.sellPrice === "number" && Number.isFinite(item.sellPrice)
      ? item.sellPrice
      : typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice)
        ? item.unitPrice
        : undefined;
  if (sell !== undefined) {
    next.sellPrice = Math.round(Math.max(0, sell) * 100) / 100;
  }
  if (typeof item.supplierCost === "number" && Number.isFinite(item.supplierCost)) {
    next.supplierCost = Math.round(Math.max(0, item.supplierCost) * 100) / 100;
  }
  if (typeof item.supplier === "string" && item.supplier.trim()) {
    next.supplier = item.supplier.trim();
  }
  if (
    typeof item.leadTimeDays === "number" &&
    Number.isInteger(item.leadTimeDays) &&
    item.leadTimeDays >= 0
  ) {
    next.leadTimeDays = item.leadTimeDays;
  }
  if (typeof item.note === "string" && item.note.trim()) {
    next.note = item.note.trim();
  }
  return next;
}

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return (
    typeof value === "string" &&
    (QUOTE_STATUSES as readonly string[]).includes(value)
  );
}

export function isTrackingCarrier(value: unknown): value is TrackingCarrier {
  return (
    typeof value === "string" &&
    (TRACKING_CARRIERS as readonly string[]).includes(value)
  );
}

export function canUploadPo(status: QuoteStatus) {
  return PO_ELIGIBLE.has(status);
}

export function pricesVisibleToCustomer(status: QuoteStatus) {
  return PRICE_VISIBLE.has(status);
}

export function trackingVisible(status: QuoteStatus) {
  return TRACKING_VISIBLE.has(status);
}

export function canEditTracking(status: QuoteStatus) {
  return status === "shipped" || status === "ordered";
}

export function quoteTitle(quote: { number: number; machineName?: string }) {
  const machine = quote.machineName?.trim();
  return machine ? `Quote ${quote.number} · ${machine}` : `Quote ${quote.number}`;
}

export function isPdfUpload(file: { name: string; type: string }) {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

export function safeDownloadName(name: string) {
  const trimmed = name.trim() || "purchase-order.pdf";
  return trimmed.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
}

export function parseActivityText(
  raw: unknown,
): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Message is required" };
  }
  const text = raw.trim();
  if (text.length > MAX_ACTIVITY_TEXT) {
    return {
      ok: false,
      error: `Message must be ${MAX_ACTIVITY_TEXT} characters or fewer`,
    };
  }
  return { ok: true, text };
}

export function canViewQuote(
  quote: Pick<QuoteRecord, "customerId">,
  user: Pick<PublicUser, "id" | "role">,
) {
  return user.role === "staff" || quote.customerId === user.id;
}

export function activityIsOwn(
  activity: Pick<QuoteActivity, "actorEmail" | "actorRole">,
  user: Pick<PublicUser, "email" | "role">,
) {
  return activity.actorEmail === user.email && activity.actorRole === user.role;
}

export function isQuoteUnreadForUser(
  quote: Pick<QuoteRecord, "activities" | "lastReadAt">,
  user: Pick<PublicUser, "id" | "email" | "role">,
) {
  const lastRead = quote.lastReadAt[user.id];
  const newestForeign = quote.activities.reduce((max, activity) => {
    if (activityIsOwn(activity, user)) {
      return max;
    }
    return activity.at > max ? activity.at : max;
  }, "");

  if (!lastRead) {
    if (newestForeign) {
      return true;
    }
    return user.role === "staff";
  }

  return Boolean(newestForeign && newestForeign > lastRead);
}

export function itemsForRole(
  items: QuoteItem[],
  role: Role,
  status: QuoteStatus,
): QuoteItem[] {
  if (role === "staff") {
    return items.map(normalizeItem);
  }
  return items.map((item) => {
    const next: QuoteItem = { id: item.id, qty: item.qty };
    if (item.name) {
      next.name = item.name;
    }
    if (pricesVisibleToCustomer(status)) {
      if (item.sellPrice !== undefined) {
        next.sellPrice = item.sellPrice;
      }
      if (item.leadTimeDays !== undefined) {
        next.leadTimeDays = item.leadTimeDays;
      }
    }
    return next;
  });
}

export function defaultTrackingUrl(
  carrier: TrackingCarrier | undefined,
  trackingNumber: string,
) {
  const encoded = encodeURIComponent(trackingNumber);
  switch (carrier) {
    case "UPS":
      return `https://www.ups.com/track?tracknum=${encoded}`;
    case "FedEx":
      return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
    case "Purolator":
      return `https://www.purolator.com/en/shipping/tracker?pin=${encoded}`;
    default:
      return undefined;
  }
}

function asTrackingUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseShipments(raw: unknown): ParseShipmentsResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Add at least one tracking number" };
  }
  if (raw.length > MAX_SHIPMENTS) {
    return { ok: false, error: `At most ${MAX_SHIPMENTS} tracking numbers` };
  }

  const shipments: QuoteShipment[] = [];
  const seen = new Set<string>();

  for (const row of raw) {
    if (!row || typeof row !== "object") {
      return { ok: false, error: "each shipment needs a tracking number" };
    }
    const record = row as {
      id?: unknown;
      trackingNumber?: unknown;
      carrier?: unknown;
      trackingUrl?: unknown;
    };
    const trackingNumber = asOptionalString(record.trackingNumber, 80);
    if (!trackingNumber) {
      return { ok: false, error: "each shipment needs a tracking number" };
    }
    const key = trackingNumber.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: "duplicate tracking number" };
    }
    seen.add(key);

    const carrier = record.carrier
      ? isTrackingCarrier(record.carrier)
        ? record.carrier
        : null
      : undefined;
    if (carrier === null) {
      return { ok: false, error: "carrier must be UPS, FedEx, Purolator, or Other" };
    }

    const trackingUrl = asTrackingUrl(record.trackingUrl);
    if (trackingUrl === null) {
      return { ok: false, error: "tracking URL must be http or https" };
    }

    const shipment: QuoteShipment = {
      id:
        typeof record.id === "string" && record.id.trim()
          ? record.id.trim()
          : `ship-${shipments.length + 1}`,
      trackingNumber,
    };
    if (carrier) {
      shipment.carrier = carrier;
    }
    const url = trackingUrl ?? defaultTrackingUrl(carrier, trackingNumber);
    if (url) {
      shipment.trackingUrl = url;
    }
    shipments.push(shipment);
  }

  return { ok: true, shipments };
}

export function formatTrackingLine(shipment: QuoteShipment) {
  return shipment.carrier
    ? `${shipment.trackingNumber} (${shipment.carrier})`
    : shipment.trackingNumber;
}

export function shippedActivityText(shipments: QuoteShipment[]) {
  return `Shipped — tracking ${shipments.map(formatTrackingLine).join(", ")}`;
}

export function trackingUpdatedActivityText(shipments: QuoteShipment[]) {
  return `Tracking updated — ${shipments.map(formatTrackingLine).join(", ")}`;
}

export function shipmentsForRole(
  shipments: QuoteShipment[],
  role: Role,
  status: QuoteStatus,
) {
  if (role === "staff" || trackingVisible(status)) {
    return shipments;
  }
  return [];
}

export function toPublicQuote(
  quote: QuoteRecord,
  user: Pick<PublicUser, "id" | "email" | "role">,
  machineName?: string,
): Quote {
  const publicQuote: Quote = {
    id: quote.id,
    number: quote.number,
    machineId: quote.machineId,
    items: itemsForRole(quote.items, user.role, quote.status),
    createdAt: quote.createdAt,
    customerEmail: user.role === "staff" ? quote.customerEmail : user.email,
    status: quote.status,
    shipments: shipmentsForRole(quote.shipments, user.role, quote.status),
    activities: quote.activities,
    unread: isQuoteUnreadForUser(quote, user),
    hasPoFile: Boolean(quote.poStoredFileName),
  };
  if (quote.note) {
    publicQuote.note = quote.note;
  }
  if (machineName) {
    publicQuote.machineName = machineName;
  }
  if (quote.poNumber) {
    publicQuote.poNumber = quote.poNumber;
  }
  if (quote.poOriginalFileName) {
    publicQuote.poOriginalFileName = quote.poOriginalFileName;
  }
  if (quote.poUploadedAt) {
    publicQuote.poUploadedAt = quote.poUploadedAt;
  }
  return publicQuote;
}

export function nextQuoteNumber(quotes: Array<{ number?: number }>) {
  let max = 0;
  for (const quote of quotes) {
    if (typeof quote.number === "number" && quote.number > max) {
      max = quote.number;
    }
  }
  return max + 1;
}

export function assignMissingQuoteNumbers(quotes: QuoteRecord[]): QuoteRecord[] {
  const ordered = [...quotes].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const used = new Set<number>();
  const assigned = new Map<string, number>();
  let next = 1;

  for (const quote of ordered) {
    if (typeof quote.number === "number" && quote.number >= 1 && !used.has(quote.number)) {
      used.add(quote.number);
      assigned.set(quote.id, quote.number);
      if (quote.number >= next) {
        next = quote.number + 1;
      }
    }
  }
  for (const quote of ordered) {
    if (!assigned.has(quote.id)) {
      while (used.has(next)) {
        next += 1;
      }
      assigned.set(quote.id, next);
      used.add(next);
      next += 1;
    }
  }

  return quotes.map((quote) => ({
    ...quote,
    number: assigned.get(quote.id) ?? quote.number,
  }));
}

function normalizeActivity(raw: unknown): QuoteActivity | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Partial<QuoteActivity>;
  if (typeof record.id !== "string" || !record.id) {
    return null;
  }
  if (typeof record.at !== "string" || !record.at) {
    return null;
  }
  if (record.actorRole !== "staff" && record.actorRole !== "customer") {
    return null;
  }
  if (typeof record.actorEmail !== "string" || !record.actorEmail) {
    return null;
  }
  const kinds: QuoteActivityKind[] = [
    "message",
    "status",
    "pricing",
    "po",
    "shipment",
  ];
  if (!record.kind || !kinds.includes(record.kind)) {
    return null;
  }
  if (typeof record.text !== "string" || !record.text.trim()) {
    return null;
  }
  return {
    id: record.id,
    at: record.at,
    actorRole: record.actorRole,
    actorEmail: record.actorEmail,
    kind: record.kind,
    text: record.text.trim(),
  };
}

function normalizeShipment(raw: unknown, index: number): QuoteShipment | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Partial<QuoteShipment>;
  const trackingNumber =
    typeof record.trackingNumber === "string" ? record.trackingNumber.trim() : "";
  if (!trackingNumber) {
    return null;
  }
  const shipment: QuoteShipment = {
    id:
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `ship-${index + 1}`,
    trackingNumber,
  };
  if (isTrackingCarrier(record.carrier)) {
    shipment.carrier = record.carrier;
  }
  if (typeof record.trackingUrl === "string" && record.trackingUrl.trim()) {
    shipment.trackingUrl = record.trackingUrl.trim();
  } else {
    const url = defaultTrackingUrl(shipment.carrier, trackingNumber);
    if (url) {
      shipment.trackingUrl = url;
    }
  }
  return shipment;
}

export function normalizeStoredQuote(
  raw: Quote | QuoteRecord | (QuoteRecord & { partIds?: unknown }),
): QuoteRecord {
  const record = (raw && typeof raw === "object" ? raw : {}) as QuoteRecord & {
    partIds?: unknown;
  };
  let items: QuoteItem[] = [];

  if (Array.isArray(record.items) && record.items.length > 0) {
    items = record.items
      .filter((item) => item && typeof item.id === "string" && item.id.trim())
      .map((item) => normalizeItem(item));
  } else if (Array.isArray(record.partIds)) {
    items = record.partIds
      .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      .map((id) => ({ id: id.trim(), qty: 1 }));
  }

  const lastReadAt: Record<string, string> = {};
  if (record.lastReadAt && typeof record.lastReadAt === "object") {
    for (const [key, value] of Object.entries(record.lastReadAt)) {
      if (typeof value === "string" && value) {
        lastReadAt[key] = value;
      }
    }
  }

  const activities = Array.isArray(record.activities)
    ? record.activities
        .map(normalizeActivity)
        .filter((row): row is QuoteActivity => row !== null)
    : [];

  const shipments = Array.isArray(record.shipments)
    ? record.shipments
        .map((row, index) => normalizeShipment(row, index))
        .filter((row): row is QuoteShipment => row !== null)
    : [];

  const status = isQuoteStatus(record.status) ? record.status : "requested";
  const createdAt =
    typeof record.createdAt === "string" && record.createdAt
      ? record.createdAt
      : new Date().toISOString();

  const next: QuoteRecord = {
    id: typeof record.id === "string" ? record.id : "",
    number: typeof record.number === "number" && record.number >= 1 ? record.number : 0,
    machineId: typeof record.machineId === "string" ? record.machineId : "",
    items,
    createdAt,
    customerEmail: typeof record.customerEmail === "string" ? record.customerEmail : "",
    customerId: typeof record.customerId === "string" ? record.customerId : "",
    status,
    shipments,
    activities,
    lastReadAt,
  };

  if (typeof record.note === "string" && record.note.trim()) {
    next.note = record.note.trim();
  }
  if (typeof record.poNumber === "string" && record.poNumber.trim()) {
    next.poNumber = record.poNumber.trim();
  }
  if (typeof record.poStoredFileName === "string" && record.poStoredFileName) {
    next.poStoredFileName = record.poStoredFileName;
  }
  if (typeof record.poOriginalFileName === "string" && record.poOriginalFileName) {
    next.poOriginalFileName = record.poOriginalFileName;
  }
  if (typeof record.poUploadedAt === "string" && record.poUploadedAt) {
    next.poUploadedAt = record.poUploadedAt;
  }

  return next;
}

export function findQuoteInList(quotes: QuoteRecord[], idOrNumber: string) {
  const exact = quotes.find((quote) => quote.id === idOrNumber);
  if (exact) {
    return exact;
  }
  const asNumber = Number(idOrNumber);
  if (Number.isInteger(asNumber) && asNumber >= 1) {
    return quotes.find((quote) => quote.number === asNumber) ?? null;
  }
  return null;
}

export function statusActivityText(status: QuoteStatus) {
  return `Status set to ${QUOTE_STATUS_LABELS[status]}.`;
}

export function lineSellTotal(item: QuoteItem) {
  if (typeof item.sellPrice !== "number") {
    return undefined;
  }
  return Math.round(item.sellPrice * item.qty * 100) / 100;
}

export function quoteSellTotal(items: QuoteItem[]) {
  let sum = 0;
  let any = false;
  for (const item of items) {
    const line = lineSellTotal(item);
    if (line !== undefined) {
      sum += line;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : undefined;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function quoteHref(role: Role, quote: { number: number }) {
  return role === "staff" ? `/staff/quotes/${quote.number}` : `/quotes/${quote.number}`;
}
