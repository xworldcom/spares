import { attachStaffAssistantAvailability } from "@/lib/assistant/public";
import { requireTenantUser } from "@/lib/auth/tenant-scope";
import { staffCustomerUsers } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import {
  hydrateQuoteItems,
  parseQuoteItems,
  quoteOwnerIdForCreate,
  staffQuoteAccountMatch,
  toPublicQuote,
} from "@/lib/quotes";
import { canAccessMachine, customerIdFromGrant, grantFromUser } from "@/lib/access";
import { publicQuoteForUser } from "@/lib/quote-http";
import { isSeedAllowed } from "@/lib/production-env";
import { belongsToTenant } from "@/lib/tenant";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import {
  createQuote,
  ensurePreviewQaQuoteFixture,
  findUserById,
  getMachine,
  getOrgContext,
  grantCustomerMachine,
  listMachines,
  listQuotes,
} from "@/lib/store";

type CreateQuoteBody = {
  machineId?: unknown;
  items?: unknown;
  note?: unknown;
  customerId?: unknown;
};

export async function GET() {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }

  if (auth.user.role === "staff" && isSeedAllowed()) {
    await ensurePreviewQaQuoteFixture(auth.tenantId);
  }

  const [quotes, machines] = await Promise.all([
    listQuotes(auth.tenantId),
    listMachines(auth.tenantId),
  ]);
  const names = new Map(machines.map((machine) => [machine.id, machine.name]));
  const visible =
    auth.user.role === "staff"
      ? quotes
      : quotes.filter((quote) => quote.customerId === auth.user.id);

  const customerUsers =
    auth.user.role === "staff" ? await staffCustomerUsers(auth.tenantId) : undefined;
  const publicQuotes = await Promise.all(
    visible.map((quote) =>
      attachStaffAssistantAvailability(
        auth.user,
        toPublicQuote(quote, auth.user, names.get(quote.machineId), { customerUsers }),
      ),
    ),
  );

  return json({
    quotes: publicQuotes,
    unreadCount: publicQuotes.filter((quote) => quote.unread).length,
  });
}

export async function POST(request: Request) {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreateQuoteBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const owner = quoteOwnerIdForCreate(
    auth.user.role,
    auth.user.id,
    typeof body.customerId === "string" ? body.customerId : "",
  );
  if (!owner.ok) {
    return error(owner.error, owner.error === "Forbidden" ? 403 : 400);
  }

  let customerEmail = auth.user.email;
  let customerId = owner.customerId;
  let personGrant: { siteIds?: string[]; machineIds?: string[] } | undefined;
  if (auth.user.role === "staff") {
    const person = await findUserById(owner.customerId);
    if (
      !person ||
      person.deletedAt ||
      person.role !== "customer" ||
      !belongsToTenant(person, auth.tenantId)
    ) {
      return error("Choose a valid customer.", 400);
    }
    customerId = person.id;
    customerEmail = person.email;
    personGrant = person;
  }

  const machineId = typeof body.machineId === "string" ? body.machineId.trim() : "";
  if (!machineId) {
    return error("machineId is required", 400);
  }

  const parsed = parseQuoteItems(body.items);
  if (!parsed.ok) {
    return error(parsed.error, 400);
  }

  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;

  const [machine, org] = await Promise.all([
    getMachine(machineId, auth.tenantId),
    getOrgContext(auth.tenantId),
  ]);
  if (!machine || !canAccessMachine(auth.user, machine, org.sites, org.customers)) {
    return error("Machine not found", 404);
  }

  if (personGrant) {
    const catalog = await listMachines(auth.tenantId);
    const personAccountId = customerIdFromGrant(
      grantFromUser(personGrant),
      org.sites,
      catalog,
    );
    const machineSite = org.sites.find(
      (row) => row.id === machine.siteId && !row.deletedAt,
    );
    const match = staffQuoteAccountMatch(personAccountId, machineSite?.customerId ?? "");
    if (!match.ok) {
      return error(match.error, 400);
    }
  }

  const items = hydrateQuoteItems(parsed.items, machine.parts);

  const created = await createQuote(auth.tenantId, {
    machineId,
    items,
    note,
    customerId,
    customerEmail,
  });
  if ("error" in created) {
    return error("Machine not found", 404);
  }

  await grantCustomerMachine(auth.tenantId, customerId, machineId);

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "quote.created",
    summary: `${auth.user.email} created quote #${created.number} for ${machine.name}.`,
    target: { type: "quote", id: created.id, label: `#${created.number}` },
    details: { machineId, customerEmail },
  });

  return json({ quote: await publicQuoteForUser(created, auth.user, machine.name) }, 201);
}
