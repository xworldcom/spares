import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { machineFileUrl, toMachineDetail, toMachineSummary } from "@/lib/machines";
import {
  isPackFormError,
  joinPackFiles,
  readPackForm,
} from "@/lib/pack-upload";
import { canAccessMachine } from "@/lib/access";
import {
  createMachine,
  listMachines,
  listSites,
  saveMachineFile,
} from "@/lib/store";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }
  const heal = request.nextUrl.searchParams.get("heal") === "1";
  const [machines, sites] = await Promise.all([listMachines({ heal }), listSites()]);
  const visible = machines.filter((machine) =>
    canAccessMachine(auth.user, machine, sites),
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

  const pack = await readPackForm(form);
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
    await saveMachineFile(pack.storedFileName, pack.modelBytes);
  }

  const sites = await listSites();
  if (pack.siteId && !sites.some((site) => site.id === pack.siteId)) {
    return error("Choose a valid plant", 400);
  }

  const machine = await createMachine({
    name: pack.name,
    storedFileName: pack.storedFileName,
    originalFileName: pack.originalFileName,
    parts: joined.parts,
    unmatched: joined.unmatched,
    siteId: pack.siteId,
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
