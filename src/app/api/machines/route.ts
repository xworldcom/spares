import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { machineFileUrl } from "@/lib/machine-file-url";
import { toMachineDetail, toMachineSummary } from "@/lib/machines";
import {
  isPackFormError,
  joinPackFiles,
  readPackForm,
} from "@/lib/pack-upload";
import { canAccessMachine } from "@/lib/access";
import {
  createMachine,
  getOrgContext,
  listMachines,
  ModelPackError,
  saveMachineFile,
} from "@/lib/store";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }
  const heal =
    auth.user.role === "staff" && request.nextUrl.searchParams.get("heal") === "1";
  const [machines, org] = await Promise.all([listMachines({ heal }), getOrgContext()]);
  const visible = machines.filter((machine) =>
    canAccessMachine(auth.user, machine, org.sites, org.customers),
  );
  return json({
    machines: visible.map((machine) =>
      toMachineSummary(machine, org.sites, org.customers),
    ),
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
    try {
      await saveMachineFile(pack.storedFileName, pack.modelBytes);
    } catch (cause) {
      if (cause instanceof ModelPackError) {
        return error(cause.message, 413);
      }
      throw cause;
    }
  }

  const org = await getOrgContext();
  if (pack.siteId && !org.sites.some((site) => site.id === pack.siteId)) {
    return error("Choose a valid site", 400);
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
      await machineFileUrl(request, machine),
      auth.user.role,
      org.sites,
      org.customers,
    ),
    201,
  );
}
