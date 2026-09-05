import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth";
import { extractMeshNames } from "@/lib/gltf";
import { error, json } from "@/lib/http";
import {
  isModelFilename,
  machineFileUrl,
  modelExtension,
  toMachineDetail,
  toMachineSummary,
} from "@/lib/machines";
import { joinParts, parsePartsList } from "@/lib/parts";
import { canAccessMachine } from "@/lib/access";
import { createMachine, listMachines, listSites, saveMachineFile } from "@/lib/store";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }
  const heal = request.nextUrl.searchParams.get("heal") === "1";
  const [machines, sites] = await Promise.all([listMachines({ heal }), listSites()]);
  const visible = machines.filter((machine) =>
    canAccessMachine(auth.user, machine),
  );
  return json({
    machines: visible.map((machine) => toMachineSummary(machine, sites)),
  });
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

  const siteValue = form.get("siteId");
  const siteId = typeof siteValue === "string" && siteValue.trim() ? siteValue.trim() : undefined;
  const sites = await listSites();
  if (siteId && !sites.some((site) => site.id === siteId)) {
    return error("Choose a valid plant", 400);
  }

  const machine = await createMachine({
    name,
    storedFileName,
    originalFileName: model.name,
    parts,
    unmatched,
    siteId,
  });

  return json(
    toMachineDetail(
      machine,
      machineFileUrl(request, machine.id),
      auth.user.role,
      sites,
    ),
    201,
  );
}
