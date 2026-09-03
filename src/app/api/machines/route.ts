import { randomUUID } from "node:crypto";
import { requireRole, requireUser } from "@/lib/auth";
import { extractMeshNames } from "@/lib/gltf";
import { error, json } from "@/lib/http";
import {
  isModelFilename,
  machineFileUrl,
  modelExtension,
  toMachineDetail,
} from "@/lib/machines";
import { joinParts, parsePartsList } from "@/lib/parts";
import { createMachine, listMachines, saveMachineFile } from "@/lib/store";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }
  return json({ machines: await listMachines() });
}

export async function POST(request: Request) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart/form-data", 400);
  }

  const nameValue = form.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  if (!name) {
    return error("Machine name is required", 400);
  }

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
  const partsText = await partsList.text();

  let listRows;
  try {
    listRows = parsePartsList(partsText, partsList.name);
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

  const machine = await createMachine({
    name,
    storedFileName,
    originalFileName: model.name,
    parts,
    unmatched,
  });

  return json(
    toMachineDetail(machine, machineFileUrl(request, machine.id), auth.user.role),
    201,
  );
}
