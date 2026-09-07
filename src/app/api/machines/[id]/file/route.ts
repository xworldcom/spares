import { requireUser } from "@/lib/auth";
import { prepareModelBytes } from "@/lib/gltf";
import { error } from "@/lib/http";
import { modelContentType } from "@/lib/machines";
import { canAccessMachine } from "@/lib/access";
import { getMachine, listSites, readStoredFile } from "@/lib/store";

export async function GET(
  _request: Request,
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

  try {
    const bytes = prepareModelBytes(await readStoredFile(machine.storedFileName));
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
