import { requireTenantCustomer, requireTenantUser } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { parseQuoteItems, toPublicQuote } from "@/lib/quotes";
import { canAccessMachine } from "@/lib/access";
import { isSeedAllowed } from "@/lib/production-env";
import {
  createQuote,
  ensurePreviewQaQuoteFixture,
  getMachine,
  getOrgContext,
  listMachines,
  listQuotes,
} from "@/lib/store";
import type { QuoteItem } from "@/types";

type CreateQuoteBody = {
  machineId?: unknown;
  items?: unknown;
  note?: unknown;
};

export async function GET() {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }

  if (auth.user.role === "staff" && isSeedAllowed()) {
    await ensurePreviewQaQuoteFixture(auth.tenantId);
  }

  const [quotes, machines] = await Promise.all([
    listQuotes(auth.tenantId),
    listMachines(auth.tenantId),
  ]);
  const names = new Map(machines.map((machine) => [machine.id, machine.name]));
  const visible =
    auth.user.role === "staff"
      ? quotes
      : quotes.filter((quote) => quote.customerId === auth.user.id);

  const publicQuotes = visible.map((quote) =>
    toPublicQuote(quote, auth.user, names.get(quote.machineId)),
  );

  return json({
    quotes: publicQuotes,
    unreadCount: publicQuotes.filter((quote) => quote.unread).length,
  });
}

export async function POST(request: Request) {
  const auth = await requireTenantCustomer();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreateQuoteBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const machineId = typeof body.machineId === "string" ? body.machineId.trim() : "";
  if (!machineId) {
    return error("machineId is required", 400);
  }

  const parsed = parseQuoteItems(body.items);
  if (!parsed.ok) {
    return error(parsed.error, 400);
  }

  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;

  const [machine, org] = await Promise.all([
    getMachine(machineId, auth.tenantId),
    getOrgContext(auth.tenantId),
  ]);
  if (!machine || !canAccessMachine(auth.user, machine, org.sites, org.customers)) {
    return error("Machine not found", 404);
  }

  const pickable = new Map(machine.parts.map((part) => [part.id, part]));
  if (parsed.items.some((item) => !pickable.has(item.id))) {
    return error("One or more part ids are not customer-pickable on this machine", 400);
  }

  const items: QuoteItem[] = parsed.items.map((item) => {
    const part = pickable.get(item.id);
    const next: QuoteItem = { id: item.id, qty: item.qty };
    const name = item.name ?? part?.name;
    if (name) {
      next.name = name;
    }
    if (part?.vendor) next.vendor = part.vendor;
    if (part?.material) next.material = part.material;
    if (part?.replaces) next.replaces = part.replaces;
    if (part?.stock) next.stock = part.stock;
    if (part?.category) next.category = part.category;
    return next;
  });

  const created = await createQuote(auth.tenantId, {
    machineId,
    items,
    note,
    customerId: auth.user.id,
    customerEmail: auth.user.email,
  });
  if ("error" in created) {
    return error("Machine not found", 404);
  }

  return json({ quote: toPublicQuote(created, auth.user, machine.name) }, 201);
}
