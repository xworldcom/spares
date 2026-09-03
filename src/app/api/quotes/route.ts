import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { parseQuoteItems } from "@/lib/quotes";
import { createQuote, getMachine, listMachines, listQuotes } from "@/lib/store";
import type { Quote } from "@/types";

type CreateQuoteBody = {
  machineId?: unknown;
  items?: unknown;
  note?: unknown;
};

function toPublicQuote(quote: Quote, machineName?: string): Quote {
  return {
    id: quote.id,
    machineId: quote.machineId,
    items: quote.items,
    note: quote.note,
    createdAt: quote.createdAt,
    customerEmail: quote.customerEmail,
    ...(machineName ? { machineName } : {}),
  };
}

export async function GET() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const [quotes, machines] = await Promise.all([listQuotes(), listMachines()]);
  const names = new Map(machines.map((machine) => [machine.id, machine.name]));
  return json({
    quotes: quotes.map((quote) =>
      toPublicQuote(quote, names.get(quote.machineId)),
    ),
  });
}

export async function POST(request: Request) {
  const auth = await requireRole("customer");
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

  const machine = await getMachine(machineId);
  if (!machine) {
    return error("Machine not found", 404);
  }

  const pickable = new Set(machine.parts.map((part) => part.id));
  if (parsed.items.some((item) => !pickable.has(item.id))) {
    return error("One or more part ids are not customer-pickable on this machine", 400);
  }

  const quote = await createQuote({
    machineId,
    items: parsed.items,
    note,
    customerId: auth.user.id,
    customerEmail: auth.user.email,
  });

  return json({ quote: toPublicQuote(quote, machine.name) }, 201);
}
