import { requireUser } from "@/lib/auth";
import { error } from "@/lib/http";
import { modelContentType } from "@/lib/machines";
import { modelPublicUrl } from "@/lib/model-url";
import {
  modelExistsInS3,
  modelProxyRefusedMessage,
  selectModelStoreKind,
} from "@/lib/model-storage";
import { MODEL_PROXY_MAX_BYTES } from "@/lib/pack-limits";
import { canAccessMachine } from "@/lib/access";
import { getMachine, listSites, readStoredFile } from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const [machine, sites] = await Promise.all([getMachine(id), listSites()]);
  if (!machine || !canAccessMachine(auth.user, machine, sites)) {
    return error("Machine not found", 404);
  }

  const publicUrl = modelPublicUrl(machine.storedFileName);
  if (publicUrl && (await modelExistsInS3(machine.storedFileName))) {
    return Response.redirect(publicUrl, 307);
  }

  try {
    const bytes = await readStoredFile(machine.storedFileName);
    if (
      selectModelStoreKind() === "s3" &&
      bytes.length > MODEL_PROXY_MAX_BYTES
    ) {
      return error(modelProxyRefusedMessage(bytes.length), 413);
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": modelContentType(machine.originalFileName),
        "Content-Disposition": `inline; filename="${machine.originalFileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return error("Model file is missing", 404);
  }
}
