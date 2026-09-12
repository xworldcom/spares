import { requireUser } from "@/lib/auth";
import { safeDownloadFilename } from "@/lib/download-filename";
import { error } from "@/lib/http";
import { resolveMachineFileServe } from "@/lib/model-file-serve";
import { canAccessMachine } from "@/lib/access";
import { getMachine, getOrgContext } from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const [machine, org] = await Promise.all([getMachine(id), getOrgContext()]);
  if (!machine || !canAccessMachine(auth.user, machine, org.sites, org.customers)) {
    return error("Machine not found", 404);
  }

  const result = await resolveMachineFileServe({
    storedFileName: machine.storedFileName,
    originalFileName: machine.originalFileName,
  });

  if (result.kind === "redirect") {
    return Response.redirect(result.url, 307);
  }
  if (result.kind === "error") {
    return error(result.message, result.status);
  }

  return new Response(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${safeDownloadFilename(result.originalFileName, "model.glb")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
