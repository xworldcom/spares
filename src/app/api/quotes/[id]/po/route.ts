import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { actorOf, machineNameFor, requireQuoteAccess } from "@/lib/quote-http";
import { error, json } from "@/lib/http";
import {
  canUploadPo,
  isPdfUpload,
  MAX_PO_BYTES,
  safeDownloadName,
  toPublicQuote,
} from "@/lib/quotes";
import {
  createQuoteActivity,
  machineFilePath,
  mutateQuote,
  saveMachineFile,
} from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }
  if (!access.quote.poStoredFileName) {
    return error("No purchase order file on this quote", 404);
  }

  try {
    const bytes = await readFile(machineFilePath(access.quote.poStoredFileName));
    const filename = safeDownloadName(
      access.quote.poOriginalFileName ?? "purchase-order.pdf",
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return error("Purchase order file is missing", 404);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }
  if (access.user.role !== "customer") {
    return error("Only the customer can upload a purchase order", 403);
  }
  if (!canUploadPo(access.quote.status)) {
    return error("PO upload is available after the quote is issued", 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart/form-data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return error("A PDF purchase order is required", 400);
  }
  if (!isPdfUpload(file)) {
    return error("Purchase order must be a PDF", 400);
  }
  if (file.size > MAX_PO_BYTES) {
    return error("PDF must be 10 MB or smaller", 400);
  }

  const poNumberValue = form.get("poNumber");
  const poNumber =
    typeof poNumberValue === "string" && poNumberValue.trim()
      ? poNumberValue.trim().slice(0, 80)
      : access.quote.poNumber;

  const storedFileName = `po-${access.quote.id}-${randomUUID()}.pdf`;
  await saveMachineFile(storedFileName, Buffer.from(await file.arrayBuffer()));

  const actor = actorOf(access.user);
  const next = await mutateQuote(access.quote.id, (quote) => {
    const stamp = new Date().toISOString();
    const nextStatus = quote.status === "quoted" ? "po_received" : quote.status;
    const activities = [
      ...quote.activities,
      createQuoteActivity(
        actor,
        "po",
        poNumber
          ? `PO uploaded (${poNumber}).`
          : "PO uploaded.",
        stamp,
      ),
    ];
    if (nextStatus !== quote.status) {
      activities.push(
        createQuoteActivity(actor, "status", "Status set to PO received.", stamp),
      );
    }
    return {
      ...quote,
      status: nextStatus,
      poNumber,
      poStoredFileName: storedFileName,
      poOriginalFileName: file.name,
      poUploadedAt: stamp,
      activities,
      lastReadAt: { ...quote.lastReadAt, [actor.id]: stamp },
    };
  });

  if (!next) {
    return error("Quote not found", 404);
  }

  return json(
    { quote: toPublicQuote(next, access.user, await machineNameFor(next)) },
    201,
  );
}
