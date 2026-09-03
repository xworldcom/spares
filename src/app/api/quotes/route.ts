import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { createQuote, getMachine, listQuotes } from "@/lib/store";
import type { Quote } from "@/types";

type CreateQuoteBody = {
  machineId?: unknown;
  partIds?: unknown;
  note?: unknown;
};

function toPublicQuote(quote: Quote): Quote {
  return {
    id: quote.id,
    machineId: quote.machineId,
    partIds: quote.partIds,
    note: quote.note,
    createdAt: quote.createdAt,
    customerEmail: quote.customerEmail,
  };
}

export async function GET() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const quotes = await listQuotes();
  return json({ quotes: quotes.map(toPublicQuote) });
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

  if (!Array.isArray(body.partIds) || body.partIds.length === 0) {
    return error("partIds must be a non-empty array", 400);
  }
  if (body.partIds.some((partId) => typeof partId !== "string" || !partId.trim())) {
    return error("partIds must be an array of part numbers", 400);
  }

  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;

  const machine = await getMachine(machineId);
  if (!machine) {
    return error("Machine not found", 404);
  }

  const pickable = new Set(machine.parts.map((part) => part.id));
  const partIds = body.partIds.map((partId) => (partId as string).trim());
  if (partIds.some((partId) => !pickable.has(partId))) {
    return error("One or more part ids are not customer-pickable on this machine", 400);
  }

  const quote = await createQuote({
    machineId,
    partIds,
    note,
    customerId: auth.user.id,
    customerEmail: auth.user.email,
  });

  return json({ quote: toPublicQuote(quote) }, 201);
}
