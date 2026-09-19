import { listManuals, getMachine, getTicket, getQuote } from "../store.ts";
import { MANUAL_CATEGORY_LABELS } from "../care.ts";
import type { Part, QuoteActivity, TicketActivity } from "../../types/index.ts";

export type AssistantThreadKind = "care" | "quote";

export type AssistantMachineContext = {
  id: string;
  name: string;
  oem?: string;
  notes?: string;
  hasModel: boolean;
  parts: Array<Pick<Part, "id" | "name" | "meshName" | "qty" | "vendor" | "material" | "category">>;
  manuals: Array<{
    id: string;
    title: string;
    category: string;
    categoryLabel: string;
    originalFileName: string;
    contentType: string;
    sizeBytes?: number;
  }>;
};

export async function loadAssistantMachineContext(
  machineId: string,
  tenantId: string,
): Promise<AssistantMachineContext | null> {
  const machine = await getMachine(machineId, tenantId);
  if (!machine) {
    return null;
  }
  const manuals = await listManuals(machine.id, tenantId);
  return {
    id: machine.id,
    name: machine.name,
    oem: machine.oem,
    notes: machine.notes,
    hasModel: Boolean(machine.storedFileName),
    parts: machine.parts.map((part) => ({
      id: part.id,
      name: part.name,
      meshName: part.meshName,
      qty: part.qty,
      vendor: part.vendor,
      material: part.material,
      category: part.category,
    })),
    manuals: manuals.map((manual) => ({
      id: manual.id,
      title: manual.title,
      category: manual.category,
      categoryLabel: MANUAL_CATEGORY_LABELS[manual.category],
      originalFileName: manual.originalFileName,
      contentType: manual.contentType,
      sizeBytes: manual.sizeBytes,
    })),
  };
}

export function formatMachineContext(context: AssistantMachineContext): string {
  const parts =
    context.parts.length === 0
      ? "No joined parts on this machine."
      : context.parts
          .slice(0, 80)
          .map((part) => {
            const extras = [part.vendor, part.material, part.category].filter(Boolean);
            return `- ${part.id} · ${part.name}${extras.length ? ` (${extras.join(", ")})` : ""} qty ${part.qty}`;
          })
          .join("\n");
  const manuals =
    context.manuals.length === 0
      ? "No manuals uploaded."
      : context.manuals
          .map(
            (manual) =>
              `- ${manual.id} · ${manual.title} [${manual.categoryLabel}] ${manual.originalFileName}`,
          )
          .join("\n");
  return [
    `Machine: ${context.name} (${context.id})`,
    context.oem ? `OEM: ${context.oem}` : null,
    context.notes ? `Notes: ${context.notes}` : null,
    `3D model uploaded: ${context.hasModel ? "yes" : "no"}`,
    "Parts:",
    parts,
    "Manuals / drawings:",
    manuals,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatThreadTranscript(
  activities: readonly (QuoteActivity | TicketActivity)[],
  limit = 20,
): string {
  const messages = activities.filter((row) => row.kind === "message").slice(-limit);
  if (messages.length === 0) {
    return "No messages yet.";
  }
  return messages
    .map((row) => {
      const who =
        row.actorRole === "assistant"
          ? "AI"
          : row.actorRole === "staff"
            ? `Staff (${row.actorEmail})`
            : `Customer (${row.actorEmail})`;
      const files = row.attachments?.length
        ? ` [attachments: ${row.attachments.map((file) => file.filename).join(", ")}]`
        : "";
      const text = (row.text || "(no text)").slice(0, 2000);
      return `${who}: ${text}${files}`;
    })
    .join("\n");
}

export async function loadAssistantThread(
  kind: AssistantThreadKind,
  id: string,
  tenantId: string,
) {
  if (kind === "care") {
    const ticket = await getTicket(id, tenantId);
    if (!ticket) {
      return null;
    }
    return {
      kind,
      id: ticket.id,
      machineId: ticket.machineId,
      title: ticket.title,
      paused: Boolean(ticket.assistantPaused),
      activities: ticket.activities,
    };
  }
  const quote = await getQuote(id, tenantId);
  if (!quote) {
    return null;
  }
  return {
    kind,
    id: quote.id,
    machineId: quote.machineId,
    title: `Quote ${quote.number}`,
    paused: Boolean(quote.assistantPaused),
    activities: quote.activities,
  };
}
