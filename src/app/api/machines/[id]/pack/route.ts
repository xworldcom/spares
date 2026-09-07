import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { extractMeshNames } from "@/lib/gltf";
import { error, json } from "@/lib/http";
import {
  isModelFilename,
  machineFileUrl,
  modelExtension,
  toMachineDetail,
} from "@/lib/machines";
import { joinParts, parsePartsList } from "@/lib/parts";
import { getMachine, listSites, replaceMachinePack, saveMachineFile } from "@/lib/store";

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

  const nameValue = form.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : existing.name;
  const model = form.get("model");
  if (!(model instanceof File) || model.size === 0) {
    return error("A GLB or GLTF model file is required", 400);
  }
  if (!isModelFilename(model.name)) {
    return error("Model must be a .glb or .gltf file", 400);
  }
  const partsList = form.get("partsList");
  if (!(partsList instanceof File) || partsList.size === 0) {
    return error("A parts list CSV or JSON file is required", 400);
  }

  const modelBytes = Buffer.from(await model.arrayBuffer());
  let listRows;
  try {
    listRows = parsePartsList(await partsList.text(), partsList.name);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid parts list";
    return error(message, 400);
  }
  let meshNames: string[];
  try {
    meshNames = extractMeshNames(modelBytes, model.name);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Could not read mesh names from the 3D file";
    return error(message, 400);
  }

  const { parts, unmatched } = joinParts(listRows, meshNames);
  const storedFileName = `${randomUUID()}${modelExtension(model.name)}`;
  await saveMachineFile(storedFileName, modelBytes);
  const updated = await replaceMachinePack(id, {
    name,
    storedFileName,
    originalFileName: model.name,
    parts,
    unmatched,
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
