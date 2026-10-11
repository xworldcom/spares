import type { NextRequest } from "next/server";
import { requireTenantStaff, requireTenantUser } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { machineFileUrl } from "@/lib/machine-file-url";
import { toMachineDetail, toMachineSummary } from "@/lib/machines";
import { parseModelLessMachineBody } from "@/lib/machine-create";
import {
  isPackFormError,
  joinPackFiles,
  readPackForm,
} from "@/lib/pack-upload";
import { canAccessMachine, canCreateMachineAtSite } from "@/lib/access";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { respondDerivedList } from "@/lib/derived-list-cache";
import { listScopeKey } from "@/lib/list-scope";
import {
  createMachine,
  findOrCreateModelLessMachine,
  getOrgContext,
  listMachines,
  listPartLifecycleRows,
  ModelPackError,
  readTenantMachinesListSnapshot,
  saveMachineFile,
} from "@/lib/store";
import { StoredFileClaimedError } from "@/lib/stored-file-claim";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }
  const heal =
    auth.user.role === "staff" && request.nextUrl.searchParams.get("heal") === "1";
  const scope = listScopeKey("machines", auth.tenantId, auth.user, heal ? "heal" : "");
  return respondDerivedList(request, scope, async () => {
    const snapshot = await readTenantMachinesListSnapshot(auth.tenantId, { heal });
    const visible = snapshot.machines.filter((machine) =>
      canAccessMachine(auth.user, machine, snapshot.sites, snapshot.customers),
    );
    return {
      machines: visible.map((machine) =>
        toMachineSummary(machine, snapshot.sites, snapshot.customers),
      ),
    };
  });
}

async function handlePOST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const auth = await requireTenantUser();
    if ("error" in auth) {
      return auth.error;
    }
    const body = await readJson(request);
    if (isErrorResponse(body)) {
      return body;
    }
    const parsed = parseModelLessMachineBody(body);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }
    const [machines, org] = await Promise.all([
      listMachines(auth.tenantId),
      getOrgContext(auth.tenantId),
    ]);
    const site = org.sites.find((row) => row.id === parsed.value.siteId);
    if (!site) {
      return error("Choose a valid site", 400);
    }
    if (!canCreateMachineAtSite(auth.user, site, machines, org.customers)) {
      return error("You cannot add a machine at that site.", 403);
    }
    const result = await findOrCreateModelLessMachine(auth.tenantId, {
      ...parsed.value,
      grantUserId: auth.user.role === "customer" ? auth.user.id : undefined,
    });
    if ("error" in result) {
      return error(
        result.error === "bad-name"
          ? "Enter a machine name."
          : "Choose a valid site",
        400,
      );
    }
    if (
      !result.created &&
      !canAccessMachine(auth.user, result.machine, org.sites, org.customers)
    ) {
      return error("A machine with that name already exists at this site.", 409);
    }
    if (result.created) {
      await recordAccountActivity({
        tenantId: auth.tenantId,
        actor: actorFromUser(auth.user),
        action: "machine.created",
        summary: `${auth.user.email} added machine ${result.machine.name}.`,
        target: { type: "machine", id: result.machine.id, label: result.machine.name },
      });
    }
    const lifecycleRows = await listPartLifecycleRows();
    return json(
      toMachineDetail(
        result.machine,
        await machineFileUrl(request, result.machine),
        auth.user.role,
        org.sites,
        org.customers,
        lifecycleRows,
      ),
      result.created ? 201 : 200,
    );
  }

  const auth = await requireTenantStaff();
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

  const org = await getOrgContext(auth.tenantId);
  if (pack.siteId && !org.sites.some((site) => site.id === pack.siteId)) {
    return error("Choose a valid site", 400);
  }

  let machine;
  try {
    machine = await createMachine(auth.tenantId, {
      name: pack.name,
      storedFileName: pack.storedFileName,
      originalFileName: pack.originalFileName,
      parts: joined.parts,
      unmatched: joined.unmatched,
      siteId: pack.siteId,
    });
  } catch (cause) {
    if (cause instanceof StoredFileClaimedError) {
      return error(cause.message, 409);
    }
    throw cause;
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "machine.created",
    summary: `${auth.user.email} added machine ${machine.name}.`,
    target: { type: "machine", id: machine.id, label: machine.name },
  });

  const lifecycleRows = await listPartLifecycleRows();
  return json(
    toMachineDetail(
      machine,
      await machineFileUrl(request, machine),
      auth.user.role,
      org.sites,
      org.customers,
      lifecycleRows,
    ),
    201,
  );
}

export const POST = withCatalogConflict(handlePOST);
