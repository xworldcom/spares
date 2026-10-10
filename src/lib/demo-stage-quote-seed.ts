import { DEMO_MULTI_MACHINE_BEARING_PART_NUMBER } from "./demo-tenant-data-migration.ts";
import { FIXTURE_MACHINE_IDS } from "./seed-fixtures.ts";
import { statusActivityText } from "./quotes.ts";
import { belongsToTenant } from "./tenant.ts";
import type { QuoteActivity, QuoteItem, QuoteRecord, QuoteShipment, QuoteStatus } from "../types/index.ts";

export const DEMO_STAGE_QUOTE_IDS = {
  po_received: "quote-demo-stage-po-received",
  confirmed: "quote-demo-stage-confirmed",
  ordered: "quote-demo-stage-ordered",
  shipped: "quote-demo-stage-shipped",
} as const;

export type DemoStageQuoteKey = keyof typeof DEMO_STAGE_QUOTE_IDS;

const DEMO_STAGE_QUOTE_STATUSES: Record<DemoStageQuoteKey, QuoteStatus> = {
  po_received: "po_received",
  confirmed: "confirmed",
  ordered: "ordered",
  shipped: "shipped",
};

const DEMO_STAGE_QUOTE_NOTES: Record<DemoStageQuoteKey, string> = {
  po_received: "Demo verify — PO received (#367)",
  confirmed: "Demo verify — Confirmed (#367)",
  ordered: "Demo verify — Ordered (#367)",
  shipped: "Demo verify — Shipped (#367)",
};

export const DEMO_STAGE_QUOTE_KEYS = Object.keys(
  DEMO_STAGE_QUOTE_IDS,
) as DemoStageQuoteKey[];

function demoStageItems(): QuoteItem[] {
  return [
    {
      id: DEMO_MULTI_MACHINE_BEARING_PART_NUMBER,
      qty: 2,
      name: "Shielded ball bearing, 8 mm ID x 22 mm OD x 7 mm W",
      sellPrice: 24.5,
      supplierCost: 8.2,
    },
  ];
}

function pipelineActivities(
  actorEmail: string,
  targetStatus: QuoteStatus,
  at: string,
): QuoteActivity[] {
  const steps: QuoteStatus[] = [
    "requested",
    "in_review",
    "pricing",
    "quoted",
    "po_received",
    "confirmed",
    "ordered",
    "shipped",
  ];
  const end = steps.indexOf(targetStatus);
  const slice = end >= 0 ? steps.slice(0, end + 1) : steps;
  return slice.map((status, index) => ({
    id: `demo-stage-act-${targetStatus}-${index}`,
    at,
    actorRole: "staff" as const,
    actorEmail,
    kind: "status" as const,
    text: statusActivityText(status),
  }));
}

export type DemoStageQuoteBuildInput = {
  tenantId: string;
  quoteId: string;
  number: number;
  machineId: string;
  customerId: string;
  customerEmail: string;
  staffEmail: string;
  key: DemoStageQuoteKey;
  createdAt: string;
};

export function buildDemoStageQuoteRecord(input: DemoStageQuoteBuildInput): QuoteRecord {
  const status = DEMO_STAGE_QUOTE_STATUSES[input.key];
  const items = demoStageItems();
  const activities = pipelineActivities(input.staffEmail, status, input.createdAt);
  const base: QuoteRecord = {
    id: input.quoteId,
    number: input.number,
    machineId: input.machineId,
    items,
    note: DEMO_STAGE_QUOTE_NOTES[input.key],
    createdAt: input.createdAt,
    customerEmail: input.customerEmail,
    customerId: input.customerId,
    tenantId: input.tenantId,
    status,
    shipments: [],
    activities,
    lastReadAt: { [input.customerId]: input.createdAt },
    poNumber: quoteHasPoStage(status) ? "DEMO-PO-367" : undefined,
    invoiceNumber: quoteHasInvoiceStage(status) ? "INV-DEMO-367" : undefined,
  };
  if (status === "shipped") {
    const shipments: QuoteShipment[] = [
      {
        id: "demo-stage-shipment-1",
        carrier: "UPS",
        trackingNumber: "1Z999AA10123456784",
      },
    ];
    return { ...base, shipments };
  }
  return base;
}

function quoteHasPoStage(status: QuoteStatus) {
  return (
    status === "po_received" ||
    status === "confirmed" ||
    status === "ordered" ||
    status === "shipped"
  );
}

function quoteHasInvoiceStage(status: QuoteStatus) {
  return quoteHasPoStage(status);
}

export function preferredDemoStageMachineId(
  machines: Array<{ id: string; parts: Array<{ id: string }> }>,
) {
  return (
    machines.find((row) => row.id === FIXTURE_MACHINE_IDS.hardware) ??
    machines.find((row) => row.id === FIXTURE_MACHINE_IDS.palletizer) ??
    machines.find((row) => row.parts.length > 0)
  )?.id;
}

type DemoStageQuoteDb = {
  quotes: QuoteRecord[];
};

/** Idempotent: append any missing stable stage quotes (host demo tenant). */
export function appendMissingDemoStageQuotes<T extends DemoStageQuoteDb>(
  db: T,
  input: {
    tenantId: string;
    machineId: string;
    customerId: string;
    customerEmail: string;
    staffEmail: string;
    nextQuoteNumber: (quotes: QuoteRecord[]) => number;
  },
): { db: T; added: number } {
  const missingKeys = DEMO_STAGE_QUOTE_KEYS.filter(
    (key) =>
      !db.quotes.some(
        (row) => row.id === DEMO_STAGE_QUOTE_IDS[key] && belongsToTenant(row, input.tenantId),
      ),
  );
  if (missingKeys.length === 0) {
    return { db, added: 0 };
  }
  const createdAt = new Date().toISOString();
  let numberCursor = input.nextQuoteNumber(db.quotes);
  const additions: QuoteRecord[] = [];
  for (const key of missingKeys) {
    additions.push(
      buildDemoStageQuoteRecord({
        tenantId: input.tenantId,
        quoteId: DEMO_STAGE_QUOTE_IDS[key],
        number: numberCursor,
        machineId: input.machineId,
        customerId: input.customerId,
        customerEmail: input.customerEmail,
        staffEmail: input.staffEmail,
        key,
        createdAt,
      }),
    );
    numberCursor += 1;
  }
  return {
    db: { ...db, quotes: [...db.quotes, ...additions] },
    added: additions.length,
  };
}
