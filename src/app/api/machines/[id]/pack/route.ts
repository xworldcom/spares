import { requireRole } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { machineFileUrl, toMachineDetail } from "@/lib/machines";
import {
  isPackFormError,
  joinPackFiles,
  readPackForm,
} from "@/lib/pack-upload";
import {
  getMachine,
  listSites,
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

  await saveMachineFile(pack.storedFileName, pack.modelBytes);

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
  return json(
    toMachineDetail(
      updated.machine,
      machineFileUrl(request, updated.machine.id),
      auth.user.role,
      await listSites(),
    ),
  );
}
