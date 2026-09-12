import { requireRole } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { machineFileUrl } from "@/lib/machine-file-url";
import { toMachineDetail } from "@/lib/machines";
import {
  isPackFormError,
  joinPackFiles,
  readPackForm,
} from "@/lib/pack-upload";
import {
  getMachine,
  getOrgContext,
  ModelPackError,
  replaceMachinePack,
  saveMachineFile,
} from "@/lib/store";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }
  const { id } = await params;
  const existing = await getMachine(id);
  if (!existing) {
    return error("Machine not found", 404);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart/form-data", 400);
  }

  const pack = await readPackForm(form, {
    nameRequired: false,
    existingName: existing.name,
  });
  if (isPackFormError(pack)) {
    return error(pack.error, pack.status);
  }

  const joined = joinPackFiles({
    modelBytes: pack.modelBytes,
    modelFileName: pack.originalFileName,
    partsText: pack.partsText,
    partsListName: pack.partsListName,
  });
  if ("error" in joined) {
    return error(joined.error, joined.status);
  }

  if (!pack.alreadyStored) {
    try {
      await saveMachineFile(pack.storedFileName, pack.modelBytes);
    } catch (cause) {
      if (cause instanceof ModelPackError) {
        return error(cause.message, 413);
      }
      throw cause;
    }
  }

  const updated = await replaceMachinePack(id, {
    name: pack.name,
    storedFileName: pack.storedFileName,
    originalFileName: pack.originalFileName,
    parts: joined.parts,
    unmatched: joined.unmatched,
  });
  if ("error" in updated) {
    return error("Machine not found", 404);
  }
  const org = await getOrgContext();
  return json(
    toMachineDetail(
      updated.machine,
      await machineFileUrl(request, updated.machine),
      auth.user.role,
      org.sites,
      org.customers,
    ),
  );
}
