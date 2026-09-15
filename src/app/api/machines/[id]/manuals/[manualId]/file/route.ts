import { requireMachineAccess } from "@/lib/care-http";
import {
  corsPreflightResponse,
  shouldUseCrossOriginObjectUrl,
  withModelAssetCors,
} from "@/lib/cors";
import { error } from "@/lib/http";
import { manualFileUrl } from "@/lib/manual-file-url";
import { readManualFile, selectManualStoreKind } from "@/lib/manual-storage";
import { tenantIdForUser } from "@/lib/tenant";
import { getManual } from "@/lib/store";
import { safeDownloadName } from "@/lib/quotes";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; manualId: string }> },
) {
  const { id, manualId } = await params;
  const access = await requireMachineAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const tenantId = tenantIdForUser(access.user);
  const manual = await getManual(access.machine.id, manualId, tenantId);
  if (!manual) {
    return error("Manual not found", 404);
  }

  if (
    selectManualStoreKind() === "s3" &&
    shouldUseCrossOriginObjectUrl(request)
  ) {
    const signed = await manualFileUrl(request, access.machine.id, manual);
    if (signed.startsWith("http://") || signed.startsWith("https://")) {
      return Response.redirect(signed, 302);
    }
  }

  const bytes = await readManualFile(manual.storedFileName);
  if (!bytes?.length) {
    return error("Manual file is missing", 404);
  }

  const filename = safeDownloadName(manual.originalFileName || "manual.pdf");
  return new Response(new Uint8Array(bytes), {
    headers: withModelAssetCors(request, {
      "Content-Type": manual.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    }),
  });
}
