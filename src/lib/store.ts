import { randomUUID } from "node:crypto";
import { hashPassword } from "./auth/password.ts";
import {
  compressModelGlb,
  validateLargeModelCompression,
} from "./gltf-compress.ts";
import { extractMeshNames, prepareModelBytes } from "./gltf.ts";
import { isModelFilename } from "./machines.ts";
import {
  deleteModelFile,
  readModelFile,
  writeModelFile,
} from "./model-storage.ts";
import {
  applyStaffPartEdit,
  knownMeshNames,
  type StaffPartEdit,
} from "./staff-catalog.ts";
import {
  filesDir,
  getPersistence,
  safeStoredFileName,
} from "./persistence.ts";
import {
  assignMissingQuoteNumbers,
  findQuoteInList,
  nextQuoteNumber,
  normalizeStoredQuote,
  statusActivityText,
} from "./quotes.ts";
import {
  FIXTURE_MACHINE_IDS,
  missingFixtureMachines,
  restoreMissingFixtureFiles,
} from "./seed-fixtures.ts";
import { canAccessMachine, normalizeAccessGrant, toPublicUser } from "./access.ts";
import { migrateOrgTree } from "./org-migration.ts";
import { activeSites } from "./org.ts";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_VERSION,
  belongsToTenant,
  canAssignStaffAcrossTenants,
  filterByTenant,
  platformOwnerEmails,
} from "./tenant.ts";
import { migrateTenants, newTenantFromName } from "./tenant-migration.ts";
import {
  buildPlatformDeploymentRow,
  type PlatformDeploymentRow,
} from "./platform-metrics.ts";
import {
  buildPlatformDirectory,
  type DirectoryEntry,
} from "./platform-directory.ts";
import type { Tenant } from "../types/index.ts";
import {
  nextTicketNumber,
  statusTicketText,
  usageHistoryEntry,
  usageSummary,
} from "./care.ts";
import { deleteManualFile, writeManualFile } from "./manual-storage.ts";
import { isSeedAllowed } from "./production-env.ts";
import type {
  MachineManual,
  MachineUsage,
  MachineView,
  ManualCategory,
  Part,
  QuoteActivity,
  QuoteItem,
  QuoteRecord,
  Role,
  CustomerAccount,
  ServiceTicketRecord,
  Site,
  TicketActivity,
  TicketStatus,
  UnmatchedPart,
} from "../types/index.ts";

export { filesDir, getDataDir } from "./persistence.ts";

export const SEED_STAFF = {
  id: "user-staff",
  email: "staff@spares.local",
  password: "SparesStaff1!",
  role: "staff" as const,
};

export const SEED_CUSTOMER = {
  id: "user-customer",
  email: "customer@spares.local",
  password: "SparesCustomer1!",
  role: "customer" as const,
};

const EXTRA_SEED_CUSTOMERS = [
  {
    id: "user-acme",
    email: "buyer@acme.test",
    password: "SparesCustomer1!",
    role: "customer" as const,
  },
  {
    id: "user-mill",
    email: "mill@example.test",
    password: "SparesCustomer1!",
    role: "customer" as const,
  },
  {
    id: "user-cargill-corp",
    email: "corp@cargill.test",
    password: "SparesCustomer1!",
    role: "customer" as const,
  },
] as const;

const SEED_NOW = "2020-01-01T00:00:00.000Z";

export const SEED_CUSTOMER_ACCOUNTS: CustomerAccount[] = [
  { id: "customer-cargill", name: "Cargill", createdAt: SEED_NOW },
  { id: "customer-acme", name: "Acme", createdAt: SEED_NOW },
  { id: "customer-demo", name: "Demo", createdAt: SEED_NOW },
];

export const SEED_SITES: Site[] = [
  {
    id: "site-cargill-ftw",
    customerId: "customer-cargill",
    name: "Fort Worth",
    createdAt: SEED_NOW,
  },
  {
    id: "site-cargill-wichita",
    customerId: "customer-cargill",
    name: "Wichita",
    createdAt: SEED_NOW,
  },
  {
    id: "site-acme-dayton",
    customerId: "customer-acme",
    name: "Dayton",
    createdAt: SEED_NOW,
  },
  {
    id: "site-demo-plant1",
    customerId: "customer-demo",
    name: "Plant 1",
    createdAt: SEED_NOW,
  },
];

const SEED_USER_SITES: Record<string, string[]> = {
  "user-customer": ["site-cargill-ftw"],
  "user-acme": ["site-acme-dayton"],
  "user-mill": ["site-demo-plant1"],
  "user-cargill-corp": ["site-cargill-ftw", "site-cargill-wichita"],
};

/** Canonical preview seed access; applied when a seed user has no modern grants yet. */
const SEED_USER_GRANTS: Record<string, { siteIds: string[]; machineIds: string[] }> = {
  "user-customer": { siteIds: [], machineIds: ["palletizer"] },
  "user-acme": { siteIds: ["site-acme-dayton"], machineIds: [] },
  "user-mill": { siteIds: ["site-demo-plant1"], machineIds: [] },
  "user-cargill-corp": {
    siteIds: ["site-cargill-ftw", "site-cargill-wichita"],
    machineIds: [],
  },
};

const SEED_CUSTOMER_USER_IDS = new Set([
  "user-customer",
  "user-acme",
  "user-mill",
  "user-cargill-corp",
]);

const SEED_MACHINE_SITES: Record<string, string> = {
  palletizer: "site-cargill-ftw",
  "hardware-fixture": "site-acme-dayton",
};

/** Soft Launch demo catalog machines always belong to the host tenant. */
const HOST_SEED_MACHINE_IDS = new Set<string>([
  FIXTURE_MACHINE_IDS.hardware,
  FIXTURE_MACHINE_IDS.palletizer,
]);

export type StoredUser = {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  role: Role;
  tenantId?: string;
  /** Set when a staff login is created; pins company scope for non–cross-tenant admins. */
  staffCreatedTenantId?: string;
  siteIds?: string[];
  /** Legacy corporate access; migrated to siteIds on read. */
  companyAccess?: string[];
  machineIds?: string[];
  deletedAt?: string;
};

export type StoredMachine = {
  id: string;
  name: string;
  storedFileName: string;
  originalFileName: string;
  parts: Part[];
  unmatched: UnmatchedPart[];
  createdAt: string;
  siteId?: string;
  tenantId?: string;
  version?: number;
  revisedAt?: string;
};

export type StoredQuote = QuoteRecord;

export type StoredBugReport = {
  id: string;
  description: string;
  createdAt: string;
  path: string;
  userAgent: string;
  userEmail?: string;
  userRole?: Role;
  tenantId?: string;
  logText: string;
  screenshotFileName: string;
  githubIssueUrl?: string;
  delivery: "github" | "store";
};

export type StoredManual = MachineManual;
export type StoredTicket = ServiceTicketRecord;
export type StoredUsage = MachineUsage;

type OrgTombstones = {
  customerIds?: string[];
  siteIds?: string[];
};

type Database = {
  schemaVersion?: number;
  tenants?: Tenant[];
  customers?: CustomerAccount[];
  users: StoredUser[];
  machines: StoredMachine[];
  quotes: StoredQuote[];
  bugReports: StoredBugReport[];
  sites: Site[];
  machineViews?: MachineView[];
  manuals?: StoredManual[];
  tickets?: StoredTicket[];
  machineUsage?: StoredUsage[];
  orgTombstones?: OrgTombstones;
};

type CareStore = {
  manuals: StoredManual[];
  tickets: StoredTicket[];
  machineUsage: StoredUsage[];
};

function emptyCare(): CareStore {
  return { manuals: [], tickets: [], machineUsage: [] };
}

function careCollections(db: Pick<Database, "manuals" | "tickets" | "machineUsage">): CareStore {
  return {
    manuals: db.manuals ?? [],
    tickets: db.tickets ?? [],
    machineUsage: db.machineUsage ?? [],
  };
}

function applyCare(db: Database, care: CareStore): Database {
  return {
    ...db,
    manuals: care.manuals,
    tickets: care.tickets,
    machineUsage: care.machineUsage,
  };
}

function unionById<T extends { id: string }>(...lists: readonly T[][]): T[] {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const row of list) {
      map.set(row.id, row);
    }
  }
  return [...map.values()];
}

function unionActivities<T extends { id: string; at: string }>(
  ...lists: readonly (readonly T[])[]
): T[] {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const row of list) {
      const previous = map.get(row.id);
      if (!previous || row.at >= previous.at) {
        map.set(row.id, row);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.at.localeCompare(b.at));
}

function mergeTicketRecord(a: StoredTicket, b: StoredTicket): StoredTicket {
  const activities = unionActivities(a.activities, b.activities);
  const latestA = a.activities.at(-1)?.at ?? "";
  const latestB = b.activities.at(-1)?.at ?? "";
  const newer = latestB > latestA ? b : a;
  return {
    ...newer,
    activities,
    lastReadAt: { ...a.lastReadAt, ...b.lastReadAt },
  };
}

function unionTickets(...lists: readonly StoredTicket[][]): StoredTicket[] {
  const map = new Map<string, StoredTicket>();
  for (const list of lists) {
    for (const ticket of list) {
      const previous = map.get(ticket.id);
      map.set(ticket.id, previous ? mergeTicketRecord(previous, ticket) : ticket);
    }
  }
  return [...map.values()];
}

function mergeQuoteRecord(a: StoredQuote, b: StoredQuote): StoredQuote {
  const activities = unionActivities(a.activities, b.activities);
  const latestA = a.activities.at(-1)?.at ?? a.createdAt;
  const latestB = b.activities.at(-1)?.at ?? b.createdAt;
  const newer = latestB > latestA ? b : a;
  const older = newer === b ? a : b;
  return {
    ...newer,
    activities,
    lastReadAt: { ...older.lastReadAt, ...newer.lastReadAt },
    items: newer.items.length >= older.items.length ? newer.items : older.items,
    shipments: newer.shipments.length >= older.shipments.length
      ? newer.shipments
      : older.shipments,
  };
}

function unionQuotes(...lists: readonly StoredQuote[][]): StoredQuote[] {
  const map = new Map<string, StoredQuote>();
  for (const list of lists) {
    for (const quote of list) {
      const previous = map.get(quote.id);
      map.set(quote.id, previous ? mergeQuoteRecord(previous, quote) : quote);
    }
  }
  return [...map.values()];
}

function unionUsage(...lists: readonly StoredUsage[][]): StoredUsage[] {
  const map = new Map<string, StoredUsage>();
  for (const list of lists) {
    for (const row of list) {
      const previous = map.get(row.machineId);
      if (!previous || (row.updatedAt ?? "") >= (previous.updatedAt ?? "")) {
        map.set(row.machineId, row);
      }
    }
  }
  return [...map.values()];
}

function unionCare(...stores: readonly CareStore[]): CareStore {
  return {
    manuals: unionById(...stores.map((store) => store.manuals)),
    tickets: unionTickets(...stores.map((store) => store.tickets)),
    machineUsage: unionUsage(...stores.map((store) => store.machineUsage)),
  };
}

function parseCareJson(raw: string | null): CareStore | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CareStore>;
    return {
      manuals: parsed.manuals ?? [],
      tickets: parsed.tickets ?? [],
      machineUsage: parsed.machineUsage ?? [],
    };
  } catch {
    return null;
  }
}

async function readCareStore(): Promise<CareStore> {
  return parseCareJson(await getPersistence().readCareJson()) ?? emptyCare();
}

async function overlayPersistedCare(db: Database): Promise<Database> {
  return applyCare(
    db,
    unionCare(careCollections(db), await readCareStore(), memory ? careCollections(memory) : emptyCare()),
  );
}

let queue: Promise<unknown> = Promise.resolve();
let memory: Database | null = null;
let loggedStoreKind = false;

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Process memory is only safe for a single local Node process on disk. */
function trustProcessMemory() {
  return getPersistence().kind === "fs" && !process.env.VERCEL;
}

function logStoreKind() {
  if (loggedStoreKind) {
    return;
  }
  loggedStoreKind = true;
  console.info(`[spares] store backend: ${getPersistence().kind}`);
}

export class ModelPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelPackError";
  }
}

async function persistModelFile(storedFileName: string, bytes: Buffer) {
  const result = await compressModelGlb(bytes);
  const validation = validateLargeModelCompression(bytes.length, result);
  if (!validation.ok) {
    throw new ModelPackError(validation.message);
  }
  await writeModelFile(storedFileName, result.bytes);
}

async function persistFile(storedFileName: string, bytes: Buffer) {
  if (isModelFilename(storedFileName)) {
    await persistModelFile(storedFileName, bytes);
    return;
  }
  await getPersistence().writeFileBytes(
    safeStoredFileName(storedFileName),
    bytes,
  );
}

async function deleteStoredFile(storedFileName: string) {
  if (isModelFilename(storedFileName)) {
    await deleteModelFile(storedFileName);
    return;
  }
  await getPersistence().deleteFileBytes(safeStoredFileName(storedFileName));
}

async function seedUser(input: {
  id: string;
  email: string;
  password: string;
  role: Role;
}): Promise<StoredUser> {
  return {
    id: input.id,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: input.role,
  };
}

async function emptyDatabase(): Promise<Database> {
  const migrated = migrateTenants({
    schemaVersion: 2,
    tenants: [],
    customers: [],
    users: [],
    machines: [],
    quotes: [],
    bugReports: [],
    sites: [],
    manuals: [],
    tickets: [],
    machineUsage: [],
  });
  return migrated.db;
}

async function seedDatabase(): Promise<Database> {
  const users: StoredUser[] = [
    await seedUser(SEED_STAFF),
    await seedUser(SEED_CUSTOMER),
    ...(await Promise.all(EXTRA_SEED_CUSTOMERS.map((row) => seedUser(row)))),
  ];
  const org = migrateOrgTree({
    users,
    machines: [],
    quotes: [],
    bugReports: [],
    customers: [...SEED_CUSTOMER_ACCOUNTS],
    sites: [...SEED_SITES],
    manuals: [],
    tickets: [],
    machineUsage: [],
  }).db;
  return migrateTenants(org).db;
}

function ownerStaffId(email: string) {
  return `user-owner-${email.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
}

async function ensureOwnerStaff(db: Database): Promise<Database> {
  const email = process.env.SPARES_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SPARES_OWNER_PASSWORD;
  if (!email || !password) {
    return db;
  }
  const passwordHash = await hashPassword(password);
  const index = db.users.findIndex(
    (user) => normalizeEmail(user.email) === email,
  );
  if (index >= 0) {
    const current = db.users[index];
    if (current.role === "staff" && current.passwordHash === passwordHash) {
      return db;
    }
    const users = db.users.slice();
    users[index] = {
      ...current,
      role: "staff",
      passwordHash,
      tenantId: current.tenantId ?? DEFAULT_TENANT_ID,
      staffCreatedTenantId: current.staffCreatedTenantId ?? DEFAULT_TENANT_ID,
    };
    return { ...db, users };
  }
  return {
    ...db,
    users: [
      ...db.users,
      {
        id: ownerStaffId(email),
        email,
        passwordHash,
        role: "staff",
        tenantId: DEFAULT_TENANT_ID,
        staffCreatedTenantId: DEFAULT_TENANT_ID,
      },
    ],
  };
}

async function ensureExtraCustomers(db: Database): Promise<Database> {
  const have = new Set(db.users.map((user) => user.email));
  const extras: StoredUser[] = [];
  for (const row of EXTRA_SEED_CUSTOMERS) {
    if (!have.has(row.email)) {
      extras.push(await seedUser(row));
    }
  }
  if (extras.length === 0) {
    return db;
  }
  return { ...db, users: [...db.users, ...extras] };
}

function stabilizeSeedUsers(db: Database): Database {
  const idByEmail = new Map<string, string>([
    [SEED_STAFF.email, SEED_STAFF.id],
    [SEED_CUSTOMER.email, SEED_CUSTOMER.id],
    ...EXTRA_SEED_CUSTOMERS.map((row) => [row.email, row.id] as const),
  ]);
  const remap = new Map<string, string>();
  const users = db.users.map((user) => {
    const stable = idByEmail.get(user.email);
    if (!stable || user.id === stable) {
      return user;
    }
    remap.set(user.id, stable);
    return { ...user, id: stable };
  });
  if (remap.size === 0) {
    return db;
  }
  const quotes = db.quotes.map((quote) => {
    const lastReadAt: Record<string, string> = {};
    for (const [key, value] of Object.entries(quote.lastReadAt ?? {})) {
      lastReadAt[remap.get(key) ?? key] = value;
    }
    const customerId = remap.get(quote.customerId) ?? quote.customerId;
    return { ...quote, customerId, lastReadAt };
  });
  return { ...db, users, quotes };
}

function tombstonedCustomerIds(db: Database) {
  return new Set(db.orgTombstones?.customerIds ?? []);
}

function tombstonedSiteIds(db: Database) {
  return new Set(db.orgTombstones?.siteIds ?? []);
}

function withCustomerTombstone(db: Database, customerId: string): Database {
  const ids = new Set([...(db.orgTombstones?.customerIds ?? []), customerId]);
  return {
    ...db,
    orgTombstones: { ...db.orgTombstones, customerIds: [...ids] },
  };
}

function withSiteTombstone(db: Database, siteId: string): Database {
  const ids = new Set([...(db.orgTombstones?.siteIds ?? []), siteId]);
  return {
    ...db,
    orgTombstones: { ...db.orgTombstones, siteIds: [...ids] },
  };
}

function isHostStaffEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (platformOwnerEmails().has(normalized)) {
    return true;
  }
  return normalized === "staff@spares.local";
}

/** Never let a stale heal drop satellite tenants or re-bind staff to the host tenant. */
function mergeStaffUserOnHeal(healed: StoredUser, latest: StoredUser): StoredUser {
  const merged = { ...healed, ...latest };
  if (merged.role !== "staff" || !merged.email || isHostStaffEmail(merged.email)) {
    return merged;
  }
  const pinned =
    latest.staffCreatedTenantId?.trim() ??
    healed.staffCreatedTenantId?.trim();
  if (pinned && !canAssignStaffAcrossTenants(merged.email)) {
    return { ...merged, tenantId: pinned, staffCreatedTenantId: pinned };
  }
  const latestTenant = latest.tenantId?.trim();
  if (latestTenant) {
    return { ...merged, tenantId: latestTenant };
  }
  return merged;
}

function mergeUsersForHeal(healed: StoredUser[], latest: StoredUser[]): StoredUser[] {
  const map = new Map<string, StoredUser>();
  for (const user of healed) {
    map.set(user.id, user);
  }
  for (const user of latest) {
    const previous = map.get(user.id);
    map.set(user.id, previous ? mergeStaffUserOnHeal(previous, user) : user);
  }
  return [...map.values()];
}

function mergeOrgUsersAndClampTenants(
  healed: Database,
  latest: Database,
  users: StoredUser[],
): StoredUser[] {
  return clampSatelliteStaffTenants({
    ...healed,
    tenants: mergeTenantsForHeal(healed.tenants, latest.tenants),
    users,
  }).users;
}

function mergeTenantsForHeal(
  healed: Tenant[] | undefined,
  latest: Tenant[] | undefined,
): Tenant[] {
  return unionById([...(healed ?? [])], [...(latest ?? [])]);
}

/** Org CRUD lives in blob writes — catalog heal must not clobber concurrent deletes. */
function mergeOrgCrudFromLatest(healed: Database, latest: Database): Database {
  const latestCare = careCollections(latest);
  const healedCare = careCollections(healed);
  const care = unionCare(healedCare, latestCare);
  return applyCare(
    {
      ...healed,
      tenants: mergeTenantsForHeal(healed.tenants, latest.tenants),
      customers: latest.customers ?? healed.customers,
      sites: latest.sites ?? healed.sites,
      users: mergeOrgUsersAndClampTenants(
        healed,
        latest,
        mergeUsersForHeal(healed.users, latest.users),
      ),
      quotes: unionQuotes(healed.quotes, latest.quotes ?? []),
      bugReports: latest.bugReports ?? healed.bugReports,
      orgTombstones: latest.orgTombstones ?? healed.orgTombstones,
    },
    care,
  );
}

function ensureTenants(db: Database): Database {
  return clampSatelliteStaffTenants(migrateTenants(db).db);
}

function ensureOrg(db: Database): Database {
  const migrated = migrateOrgTree(ensureTenants(db));
  let next = migrated.db;
  const deletedCustomers = tombstonedCustomerIds(next);
  const deletedSites = tombstonedSiteIds(next);
  const haveCustomers = new Map((next.customers ?? []).map((row) => [row.id, row]));
  const haveSites = new Map((next.sites ?? []).map((site) => [site.id, site]));
  if (isSeedAllowed()) {
    for (const customer of SEED_CUSTOMER_ACCOUNTS) {
      if (deletedCustomers.has(customer.id)) {
        continue;
      }
      if (!haveCustomers.has(customer.id)) {
        haveCustomers.set(customer.id, {
          ...customer,
          tenantId: customer.tenantId ?? DEFAULT_TENANT_ID,
        });
      }
    }
    for (const site of SEED_SITES) {
      if (deletedSites.has(site.id)) {
        continue;
      }
      if (haveSites.has(site.id)) {
        continue;
      }
      const customer = haveCustomers.get(site.customerId);
      if (customer?.deletedAt || deletedCustomers.has(site.customerId)) {
        continue;
      }
      haveSites.set(site.id, {
        ...site,
        tenantId: site.tenantId ?? DEFAULT_TENANT_ID,
      });
    }
  }
  const customers = [...haveCustomers.values()].sort((a, b) => {
    const aDeleted = a.deletedAt ? 1 : 0;
    const bDeleted = b.deletedAt ? 1 : 0;
    if (aDeleted !== bDeleted) {
      return aDeleted - bDeleted;
    }
    return a.name.localeCompare(b.name);
  });
  const sites = [...haveSites.values()].sort((a, b) => {
    const aDeleted = a.deletedAt ? 1 : 0;
    const bDeleted = b.deletedAt ? 1 : 0;
    if (aDeleted !== bDeleted) {
      return aDeleted - bDeleted;
    }
    return `${a.customerId} ${a.name}`.localeCompare(`${b.customerId} ${b.name}`);
  });
  const machines = next.machines.map((machine) => {
    let row = machine;
    if (
      isSeedAllowed() &&
      HOST_SEED_MACHINE_IDS.has(machine.id) &&
      row.tenantId !== DEFAULT_TENANT_ID
    ) {
      row = { ...row, tenantId: DEFAULT_TENANT_ID };
    }
    const seeded = SEED_MACHINE_SITES[machine.id];
    if (seeded && isSeedAllowed()) {
      return row.siteId === seeded ? row : { ...row, siteId: seeded };
    }
    if (row.siteId) {
      return row;
    }
    return seeded ? { ...row, siteId: seeded } : row;
  });
  const users = next.users.map((user) => {
    if (user.deletedAt) {
      return user;
    }
    let healed = user;
    if (isSeedAllowed() && SEED_CUSTOMER_USER_IDS.has(user.id) && user.role !== "customer") {
      healed = { ...healed, role: "customer" as const };
    }
    if (healed.role !== "customer") {
      return healed;
    }
    const hasSiteIds = (healed.siteIds?.length ?? 0) > 0;
    const hasMachineIds = (healed.machineIds?.length ?? 0) > 0;
    const hasCompanyAccess = (healed.companyAccess?.length ?? 0) > 0;
    if ((hasSiteIds || hasMachineIds) && hasCompanyAccess) {
      healed = { ...healed, companyAccess: undefined };
    }
    if (isSeedAllowed() && user.id === "user-customer") {
      const hardware = machines.find((row) => row.id === "hardware-fixture");
      if (
        hardware &&
        canAccessMachine(
          {
            role: "customer",
            siteIds: healed.siteIds ?? [],
            machineIds: healed.machineIds ?? [],
            companyAccess: healed.companyAccess,
          },
          hardware,
          sites,
          customers,
        )
      ) {
        const canonical = SEED_USER_GRANTS["user-customer"];
        return {
          ...healed,
          role: "customer" as const,
          siteIds: canonical.siteIds,
          machineIds: canonical.machineIds,
          companyAccess: undefined,
        };
      }
    }
    const hasAccess =
      (healed.siteIds?.length ?? 0) > 0 ||
      (healed.machineIds?.length ?? 0) > 0 ||
      (healed.companyAccess?.length ?? 0) > 0;
    if (hasAccess) {
      return healed;
    }
    if (isSeedAllowed()) {
      const seededGrant = SEED_USER_GRANTS[user.id];
      if (seededGrant) {
        return {
          ...healed,
          siteIds: seededGrant.siteIds,
          machineIds: seededGrant.machineIds,
          companyAccess: undefined,
        };
      }
      const seeded = SEED_USER_SITES[user.id];
      if (seeded) {
        return { ...healed, siteIds: seeded, machineIds: [], companyAccess: undefined };
      }
    }
    return healed;
  });
  return migrateOrgTree({
    ...next,
    customers,
    sites,
    users,
    machines,
  }).db;
}

async function withFixtureMachines(db: Database): Promise<Database> {
  if (!isSeedAllowed()) {
    return db;
  }
  const extras = await missingFixtureMachines(db.machines, persistFile);
  if (extras.length === 0) {
    return db;
  }
  const stamped = extras.map((machine) => ({
    ...machine,
    tenantId: DEFAULT_TENANT_ID,
  }));
  return { ...db, machines: [...db.machines, ...stamped] };
}

function catalogChanged(before: Database, after: Database) {
  return (
    after.machines.length !== before.machines.length ||
    after.users.length !== before.users.length ||
    (after.tenants?.length ?? 0) !== (before.tenants?.length ?? 0) ||
    (after.sites?.length ?? 0) !== (before.sites?.length ?? 0) ||
    (after.customers?.length ?? 0) !== (before.customers?.length ?? 0) ||
    after.users.some((user, index) => user.id !== before.users[index]?.id) ||
    staffTenantAssignmentsChanged(before.users, after.users) ||
    hostSeedMachineTenantsChanged(before, after)
  );
}

function staffTenantAssignmentsChanged(before: StoredUser[], after: StoredUser[]) {
  const beforeById = new Map(before.map((user) => [user.id, user.tenantId]));
  return after.some((user) => beforeById.get(user.id) !== user.tenantId);
}

function hostSeedMachineTenantsChanged(before: Database, after: Database) {
  if (!isSeedAllowed()) {
    return false;
  }
  const beforeById = new Map(before.machines.map((machine) => [machine.id, machine.tenantId]));
  return after.machines.some((machine) => {
    if (!HOST_SEED_MACHINE_IDS.has(machine.id)) {
      return false;
    }
    return beforeById.get(machine.id) !== machine.tenantId;
  });
}

function bindStaffTenantIds(
  db: Database,
  bindings: ReadonlyArray<{ userId: string; tenantId: string }>,
): Database {
  if (bindings.length === 0) {
    return db;
  }
  const byId = new Map(bindings.map((row) => [row.userId, row.tenantId]));
  return {
    ...db,
    users: db.users.map((user) => {
      const tenantId = byId.get(user.id);
      return tenantId ? { ...user, tenantId } : user;
    }),
  };
}

function satelliteTenantByBootstrapEmail(db: Database) {
  const map = new Map<string, string>();
  for (const tenant of db.tenants ?? []) {
    if (tenant.id === DEFAULT_TENANT_ID) {
      continue;
    }
    const bootstrap = tenant.bootstrapStaffEmail?.trim().toLowerCase();
    if (bootstrap) {
      map.set(bootstrap, tenant.id);
    }
  }
  return map;
}

/**
 * Move satellite bootstrap staff off the host tenant when catalog heal left them on
 * tenant-oee360-host. Host-company staff (no bootstrap binding) stay on the host tenant.
 */
function clampSatelliteStaffTenants(db: Database): Database {
  const byBootstrapEmail = satelliteTenantByBootstrapEmail(db);
  if (byBootstrapEmail.size === 0) {
    return db;
  }
  let changed = false;
  const users = db.users.map((user) => {
    if (user.role !== "staff" || !user.email || isHostStaffEmail(user.email)) {
      return user;
    }
    const pinned = user.staffCreatedTenantId?.trim();
    if (pinned) {
      if (user.tenantId === pinned) {
        return user;
      }
      changed = true;
      return { ...user, tenantId: pinned };
    }
    if (user.tenantId && user.tenantId !== DEFAULT_TENANT_ID) {
      return user;
    }
    const target = byBootstrapEmail.get(normalizeEmail(user.email));
    if (!target || user.tenantId === target) {
      return user;
    }
    changed = true;
    return { ...user, tenantId: target };
  });
  return changed ? { ...db, users } : db;
}

/**
 * Always re-run fixture + seed-user heal. A warm in-memory db with users but
 * empty machines must not stick around. Remote backends re-read every time.
 */
async function stabilizeCatalogUsers(db: Database): Promise<Database> {
  if (!isSeedAllowed()) {
    return await ensureOwnerStaff(db);
  }
  return await ensureOwnerStaff(
    await ensureExtraCustomers(stabilizeSeedUsers(db)),
  );
}

async function ensureCatalog(options?: { restoreFiles?: boolean }): Promise<Database> {
  const db = await readDatabase();
  const next = ensureOrg(
    await withFixtureMachines(await stabilizeCatalogUsers(db)),
  );
  if (options?.restoreFiles && isSeedAllowed()) {
    await restoreMissingFixtureFiles(
      next.machines,
      async (name) => Boolean((await readModelFile(name))?.length),
      persistFile,
    );
  }
  const kept = await overlayPersistedCare(next);
  if (catalogChanged(db, kept)) {
    await writeCatalogHeal(kept);
    return kept;
  }
  memory = kept;
  return kept;
}

function parseDatabase(
  raw: string,
): { db: Database; numbersAssigned: boolean } | null {
  try {
    const parsed = JSON.parse(raw) as Database;
    if (!parsed.users?.length) {
      return null;
    }
    const rawQuotes = parsed.quotes ?? [];
    return {
      db: {
        schemaVersion: parsed.schemaVersion,
        tenants: parsed.tenants ?? [],
        customers: parsed.customers ?? [],
        users: parsed.users ?? [],
        machines: parsed.machines ?? [],
        quotes: rawQuotes.map((quote) => normalizeStoredQuote(quote)),
        bugReports: parsed.bugReports ?? [],
        sites: parsed.sites ?? [],
        machineViews: parsed.machineViews ?? [],
        manuals: parsed.manuals ?? [],
        tickets: parsed.tickets ?? [],
        machineUsage: parsed.machineUsage ?? [],
        orgTombstones: parsed.orgTombstones,
      },
      numbersAssigned: rawQuotes.some(
        (quote) => typeof quote.number !== "number" || quote.number < 1,
      ),
    };
  } catch {
    return null;
  }
}

async function readDatabase(): Promise<Database> {
  logStoreKind();
  if (memory && trustProcessMemory()) {
    return memory;
  }

  const raw = await getPersistence().readDatabaseJson();
  const loaded = raw ? parseDatabase(raw) : null;
  if (!loaded) {
    const base = isSeedAllowed() ? await seedDatabase() : await emptyDatabase();
    const seeded = await overlayPersistedCare(
      await withFixtureMachines(await ensureOwnerStaff(base)),
    );
    await writeDatabase(seeded);
    return seeded;
  }

  const quotes = assignMissingQuoteNumbers(loaded.db.quotes);
  const next = await overlayPersistedCare(
    ensureOrg(
      await withFixtureMachines(
        await stabilizeCatalogUsers({ ...loaded.db, quotes }),
      ),
    ),
  );
  const usersRemapped =
    next.users.length !== loaded.db.users.length ||
    next.users.some((user, index) => user.id !== loaded.db.users[index]?.id);
  if (
    next.machines.length !== loaded.db.machines.length ||
    loaded.numbersAssigned ||
    usersRemapped ||
    staffTenantAssignmentsChanged(loaded.db.users, next.users) ||
    (next.tenants?.length ?? 0) !== (loaded.db.tenants?.length ?? 0) ||
    (next.sites?.length ?? 0) !== (loaded.db.sites?.length ?? 0) ||
    (next.customers?.length ?? 0) !== (loaded.db.customers?.length ?? 0) ||
    (next.schemaVersion ?? 1) !== (loaded.db.schemaVersion ?? 1)
  ) {
    await writeCatalogHeal(next);
    return next;
  }
  memory = next;
  return next;
}

async function writeCareStore(care: CareStore) {
  await getPersistence().writeCareJson(JSON.stringify(care, null, 2));
}

async function writeDatabase(next: Database) {
  const normalized = applyCare(clampSatelliteStaffTenants(next), careCollections(next));
  memory = normalized;
  await Promise.all([
    getPersistence().writeDatabaseJson(JSON.stringify(normalized, null, 2)),
    writeCareStore(careCollections(normalized)),
  ]);
}

/** Org creates race catalog heals — merge with latest blob before persisting. */
async function writeDatabaseWithOrgMerge(next: Database) {
  let merged = clampSatelliteStaffTenants(next);
  for (let pass = 0; pass < 2; pass++) {
    const latestRaw = await getPersistence().readDatabaseJson();
    const loaded = latestRaw ? parseDatabase(latestRaw) : null;
    if (!loaded?.db) {
      break;
    }
    merged = clampSatelliteStaffTenants(mergeOrgCrudFromLatest(merged, loaded.db));
  }
  const normalized = applyCare(merged, careCollections(merged));
  memory = normalized;
  await Promise.all([
    getPersistence().writeDatabaseJson(JSON.stringify(normalized, null, 2)),
    writeCareStore(careCollections(normalized)),
  ]);
}

/** Catalog/seed heals rewrite db.json — never replace the Care sidecar. */
async function writeCatalogHeal(next: Database) {
  let merged = next;
  for (let pass = 0; pass < 2; pass++) {
    const latestRaw = await getPersistence().readDatabaseJson();
    const loaded = latestRaw ? parseDatabase(latestRaw) : null;
    if (!loaded?.db) {
      break;
    }
    merged = mergeOrgCrudFromLatest(merged, loaded.db);
  }
  const kept = await overlayPersistedCare(clampSatelliteStaffTenants(merged));
  memory = kept;
  await Promise.all([
    getPersistence().writeDatabaseJson(JSON.stringify(kept, null, 2)),
    writeCareStore(careCollections(kept)),
  ]);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function findUserById(id: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return db.users.find((user) => user.id === id) ?? null;
  });
}

export function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  return withLock(async () => {
    const db = await ensureCatalog();
    const matches = db.users.filter(
      (user) => user.email === normalized && !user.deletedAt,
    );
    if (matches.length === 0) {
      return null;
    }
    if (matches.length === 1) {
      return matches[0];
    }
    return null;
  });
}

export function listTenants() {
  return withLock(async () => {
    const db = await ensureCatalog();
    return [...(db.tenants ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  });
}

function platformCatalogSlice(db: Database) {
  const care = careCollections(db);
  return {
    users: db.users,
    customers: db.customers ?? [],
    sites: db.sites ?? [],
    machines: db.machines,
    quotes: db.quotes,
    tickets: care.tickets,
    machineUsage: care.machineUsage,
  };
}

export function listPlatformDeployments() {
  return withLock(async () => {
    const db = await ensureCatalog();
    const catalog = platformCatalogSlice(db);
    const tenants = [...(db.tenants ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return tenants.map((tenant) => buildPlatformDeploymentRow(tenant, catalog));
  });
}

export function listPlatformDirectory() {
  return withLock(async () => {
    const db = await ensureCatalog();
    return buildPlatformDirectory({
      tenants: db.tenants ?? [],
      customers: db.customers ?? [],
      users: db.users,
    });
  });
}

export type { DirectoryEntry };

export function getPlatformDeployment(tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const tenant = (db.tenants ?? []).find((row) => row.id === tenantId);
    if (!tenant) {
      return { error: "not-found" as const };
    }
    const catalog = platformCatalogSlice(db);
    const deployment = buildPlatformDeploymentRow(tenant, catalog);
    const staff = db.users
      .filter(
        (user) =>
          user.role === "staff" && !user.deletedAt && belongsToTenant(user, tenantId),
      )
      .map((user) => ({
        id: user.id,
        email: user.email,
        tenantId: user.tenantId ?? null,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
    return { deployment, staff };
  });
}

export function updateTenantPlatformMeta(
  tenantId: string,
  patch: { name?: string; inactive?: boolean },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = (db.tenants ?? []).findIndex((row) => row.id === tenantId);
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const tenants = [...(db.tenants ?? [])];
    const current = tenants[index];
    let next: Tenant = { ...current };

    if (typeof patch.name === "string") {
      const trimmed = patch.name.trim();
      if (!trimmed) {
        return { error: "invalid" as const };
      }
      if (
        tenants.some(
          (row, i) => i !== index && row.name.toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return { error: "taken" as const };
      }
      next = { ...next, name: trimmed };
    }

    if (patch.inactive === true) {
      if (tenantId === DEFAULT_TENANT_ID) {
        return { error: "host-immutable" as const };
      }
      next = { ...next, inactiveAt: new Date().toISOString() };
    } else if (patch.inactive === false) {
      const { inactiveAt: _, ...rest } = next;
      next = rest as Tenant;
    }

    tenants[index] = next;
    await writeDatabase({ ...db, tenants });
    return { tenant: next };
  });
}

export type { PlatformDeploymentRow };

function tenantNameTaken(db: Database, trimmed: string) {
  const slugTaken = (db.tenants ?? []).some(
    (row) => row.slug === newTenantFromName(trimmed).slug,
  );
  const nameTaken = (db.tenants ?? []).some(
    (row) => row.name.toLowerCase() === trimmed.toLowerCase(),
  );
  return slugTaken || nameTaken;
}

export function createTenant(name: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const trimmed = name.trim();
    if (!trimmed) {
      return { error: "invalid" as const };
    }
    if (tenantNameTaken(db, trimmed)) {
      return { error: "taken" as const };
    }
    const tenant = newTenantFromName(trimmed);
    await writeDatabase({
      ...db,
      tenants: [...(db.tenants ?? []), tenant],
    });
    return { tenant };
  });
}

/** One write so first staff always shares the new tenant row (no heal gap). */
export function createTenantWithOptionalStaff(
  name: string,
  staff?: { email: string; passwordHash: string },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const trimmed = name.trim();
    if (!trimmed) {
      return { error: "invalid" as const };
    }
    if (tenantNameTaken(db, trimmed)) {
      return { error: "taken" as const };
    }
    let tenant: Tenant = newTenantFromName(trimmed);
    let users = db.users;
    let staffUser: StoredUser | undefined;
    if (staff) {
      const normalized = normalizeEmail(staff.email);
      tenant = { ...tenant, bootstrapStaffEmail: normalized };
      if (db.users.some((user) => user.email === normalized && !user.deletedAt)) {
        return { error: "email-taken" as const };
      }
      staffUser = {
        id: randomUUID(),
        email: normalized,
        passwordHash: staff.passwordHash,
        role: "staff",
        tenantId: tenant.id,
        staffCreatedTenantId: tenant.id,
      };
      users = [...users, staffUser];
    }
    const draft = {
      ...db,
      schemaVersion: Math.max(db.schemaVersion ?? 1, TENANT_SCHEMA_VERSION),
      tenants: [...(db.tenants ?? []), tenant],
      users,
    };
    const migrated = migrateTenants(draft).db;
    let finalUsers = migrated.users;
    if (staffUser) {
      finalUsers = migrated.users.map((user) =>
        user.id === staffUser!.id ? { ...user, tenantId: tenant.id } : user,
      );
      staffUser = { ...staffUser, tenantId: tenant.id };
    }
    const payload = bindStaffTenantIds(
      clampSatelliteStaffTenants({ ...migrated, users: finalUsers }),
      staffUser ? [{ userId: staffUser.id, tenantId: tenant.id }] : [],
    );
    await writeDatabaseWithOrgMerge(payload);
    return { tenant, staffUser };
  });
}

export function createTenantStaffUser(
  tenantId: string,
  input: { email: string; passwordHash: string; role: Role },
) {
  const normalized = normalizeEmail(input.email);
  return withLock(async () => {
    const db = await readDatabase();
    const tenant = (db.tenants ?? []).find((row) => row.id === tenantId);
    if (!tenant) {
      return { error: "bad-tenant" as const };
    }
    if (db.users.some((user) => user.email === normalized && !user.deletedAt)) {
      return { error: "email-taken" as const };
    }
    const user: StoredUser = {
      id: randomUUID(),
      email: normalized,
      passwordHash: input.passwordHash,
      role: input.role,
      tenantId,
      staffCreatedTenantId: tenantId,
    };
    const payload = { ...db, users: [...db.users, user] };
    await writeDatabaseWithOrgMerge(payload);
    const persisted = (memory ?? (await readDatabase())).users.find(
      (row) => row.id === user.id,
    );
    return { user: persisted ?? user };
  });
}

export function listStaffUsersForPlatform() {
  return withLock(async () => {
    const db = await ensureCatalog();
    const tenants = new Map((db.tenants ?? []).map((row) => [row.id, row.name]));
    return db.users
      .filter((user) => user.role === "staff" && !user.deletedAt)
      .map((user) => ({
        id: user.id,
        email: user.email,
        tenantId: user.tenantId ?? null,
        tenantName: user.tenantId ? (tenants.get(user.tenantId) ?? user.tenantId) : null,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  });
}

export function listStaffUsersForTenant(tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return db.users
      .filter(
        (user) =>
          user.role === "staff" && !user.deletedAt && belongsToTenant(user, tenantId),
      )
      .map((user) => ({
        id: user.id,
        email: user.email,
        tenantId: user.tenantId ?? null,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  });
}

export function listCustomers(tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const sites = filterByTenant(db.sites ?? [], tenantId);
    const customers = filterByTenant(db.customers ?? [], tenantId);
    return db.users
      .filter(
        (user) =>
          user.role === "customer" && !user.deletedAt && belongsToTenant(user, tenantId),
      )
      .map((user) => toPublicUser(user, sites, customers))
      .sort((a, b) => a.email.localeCompare(b.email));
  });
}

export function listCustomerAccounts(tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return filterByTenant(db.customers ?? [], tenantId)
      .filter((row) => !row.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function getCustomerAccount(id: string, tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const row =
      (db.customers ?? []).find((row) => row.id === id && !row.deletedAt) ?? null;
    if (!row || !belongsToTenant(row, tenantId)) {
      return null;
    }
    return row;
  });
}

export function createCustomerAccount(name: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const trimmed = name.trim();
    if (!trimmed) {
      return { error: "invalid" as const };
    }
    const exists = filterByTenant(db.customers ?? [], tenantId).some(
      (row) => !row.deletedAt && row.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      return { error: "taken" as const };
    }
    const account: CustomerAccount = {
      id: `customer-${randomUUID()}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      tenantId,
    };
    await writeDatabase({
      ...db,
      customers: [...(db.customers ?? []), account],
    });
    return { account };
  });
}

export function updateCustomerAccount(
  id: string,
  tenantId: string,
  patch: { name?: string },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const customers = db.customers ?? [];
    const index = customers.findIndex(
      (row) => row.id === id && !row.deletedAt && belongsToTenant(row, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) {
        return { error: "invalid" as const };
      }
      const taken = filterByTenant(customers, tenantId).some(
        (row) =>
          row.id !== id &&
          !row.deletedAt &&
          row.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (taken) {
        return { error: "taken" as const };
      }
      const next = customers.slice();
      next[index] = { ...next[index], name: trimmed };
      await writeDatabase({ ...db, customers: next });
      return { account: next[index] };
    }
    return { account: customers[index] };
  });
}

export function deleteCustomerAccount(id: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const customers = db.customers ?? [];
    const index = customers.findIndex(
      (row) => row.id === id && !row.deletedAt && belongsToTenant(row, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const liveSites = activeSites(db.sites ?? []).filter(
      (site) => site.customerId === id,
    );
    if (liveSites.length > 0) {
      return { error: "has-sites" as const };
    }
    const next = customers.slice();
    next[index] = { ...next[index], deletedAt: new Date().toISOString() };
    await writeDatabase(withCustomerTombstone({ ...db, customers: next }, id));
    return { ok: true as const };
  });
}

export function createCustomer(
  tenantId: string,
  email: string,
  passwordHash: string,
  access: {
    siteIds?: string[];
    companyAccess?: string[];
    machineIds?: string[];
    name?: string;
  } = {},
) {
  const normalized = normalizeEmail(email);
  const trimmedName = access.name?.trim();
  return withLock(async () => {
    const db = await readDatabase();
    if (db.users.some((user) => user.email === normalized && !user.deletedAt)) {
      return { error: "email-taken" as const };
    }
    const known = new Set(
      activeSites(filterByTenant(db.sites ?? [], tenantId)).map((site) => site.id),
    );
    const machineIds = new Set(
      filterByTenant(db.machines, tenantId).map((machine) => machine.id),
    );
    const user: StoredUser = {
      id: randomUUID(),
      email: normalized,
      passwordHash,
      role: "customer",
      tenantId,
      siteIds: [...new Set((access.siteIds ?? []).filter((id) => known.has(id)))],
      machineIds: [
        ...new Set((access.machineIds ?? []).filter((id) => machineIds.has(id))),
      ],
      ...(trimmedName ? { name: trimmedName } : {}),
    };
    await writeDatabase({ ...db, users: [...db.users, user] });
    return { user };
  });
}

export function deletePerson(userId: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.users.findIndex(
      (user) => user.id === userId && belongsToTenant(user, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const user = db.users[index];
    if (user.role !== "customer") {
      return { error: "not-customer" as const };
    }
    const users = db.users.slice();
    users[index] = { ...user, deletedAt: new Date().toISOString() };
    await writeDatabase({ ...db, users });
    return { ok: true as const };
  });
}

export function listSites(tenantId: string, customerId?: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const rows = activeSites(filterByTenant(db.sites ?? [], tenantId));
    if (!customerId) {
      return rows;
    }
    return rows.filter((site) => site.customerId === customerId);
  });
}

export function getOrgContext(tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return {
      sites: activeSites(filterByTenant(db.sites ?? [], tenantId)),
      customers: filterByTenant(db.customers ?? [], tenantId).filter(
        (row) => !row.deletedAt,
      ),
    };
  });
}

export function getSite(id: string, tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const site = activeSites(db.sites ?? []).find((site) => site.id === id) ?? null;
    if (!site || !belongsToTenant(site, tenantId)) {
      return null;
    }
    return site;
  });
}

export function createSite(tenantId: string, customerId: string, name: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const customer = (db.customers ?? []).find(
      (row) =>
        row.id === customerId && !row.deletedAt && belongsToTenant(row, tenantId),
    );
    if (!customer) {
      return { error: "bad-customer" as const };
    }
    const nextName = name.trim();
    if (!nextName) {
      return { error: "invalid" as const };
    }
    const exists = activeSites(filterByTenant(db.sites ?? [], tenantId)).some(
      (site) =>
        site.customerId === customerId &&
        site.name.toLowerCase() === nextName.toLowerCase(),
    );
    if (exists) {
      return { error: "taken" as const };
    }
    const site: Site = {
      id: `site-${randomUUID()}`,
      customerId,
      name: nextName,
      createdAt: new Date().toISOString(),
      tenantId,
    };
    const sites = [...(db.sites ?? []), site].sort((a, b) =>
      `${a.customerId} ${a.name}`.localeCompare(`${b.customerId} ${b.name}`),
    );
    await writeDatabase({ ...db, sites });
    return { site };
  });
}

export function updateSite(
  siteId: string,
  tenantId: string,
  patch: { name?: string; customerId?: string },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const sites = db.sites ?? [];
    const index = sites.findIndex(
      (site) =>
        site.id === siteId && !site.deletedAt && belongsToTenant(site, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    let next = sites[index];
    if (patch.customerId !== undefined) {
      const customer = (db.customers ?? []).find(
        (row) =>
          row.id === patch.customerId &&
          !row.deletedAt &&
          belongsToTenant(row, tenantId),
      );
      if (!customer) {
        return { error: "bad-customer" as const };
      }
      next = { ...next, customerId: patch.customerId };
    }
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) {
        return { error: "invalid" as const };
      }
      const taken = activeSites(filterByTenant(sites, tenantId)).some(
        (site) =>
          site.id !== siteId &&
          site.customerId === next.customerId &&
          site.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (taken) {
        return { error: "taken" as const };
      }
      next = { ...next, name: trimmed };
    }
    const updated = sites.slice();
    updated[index] = next;
    await writeDatabase({ ...db, sites: updated });
    return { site: next };
  });
}

export function deleteSite(siteId: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const sites = db.sites ?? [];
    const index = sites.findIndex(
      (site) =>
        site.id === siteId && !site.deletedAt && belongsToTenant(site, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const machines = db.machines.filter((machine) => machine.siteId === siteId);
    if (machines.length > 0) {
      return { error: "has-machines" as const };
    }
    const updated = sites.slice();
    updated[index] = {
      ...updated[index],
      deletedAt: new Date().toISOString(),
    };
    const users = db.users.map((user) => {
      if (user.role !== "customer" || !user.siteIds?.includes(siteId)) {
        return user;
      }
      return {
        ...user,
        siteIds: user.siteIds.filter((id) => id !== siteId),
      };
    });
    await writeDatabase(withSiteTombstone({ ...db, sites: updated, users }, siteId));
    return { ok: true as const };
  });
}

export function updatePerson(
  userId: string,
  tenantId: string,
  patch: {
    name?: string | null;
    email?: string;
    siteIds?: string[];
    companyAccess?: string[];
    machineIds?: string[];
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.users.findIndex(
      (user) => user.id === userId && belongsToTenant(user, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const user = db.users[index];
    if (user.role !== "customer" || user.deletedAt) {
      return { error: "not-customer" as const };
    }

    let next: StoredUser = { ...user };

    if (patch.email !== undefined) {
      const normalized = normalizeEmail(patch.email);
      if (!normalized) {
        return { error: "bad-email" as const };
      }
      if (
        db.users.some(
          (row) =>
            row.id !== userId &&
            row.email === normalized &&
            !row.deletedAt &&
            belongsToTenant(row, tenantId),
        )
      ) {
        return { error: "email-taken" as const };
      }
      next = { ...next, email: normalized };
    }

    if (patch.name !== undefined) {
      const trimmed = patch.name?.trim() ?? "";
      if (trimmed) {
        next = { ...next, name: trimmed };
      } else {
        const { name: _removed, ...rest } = next;
        next = rest as StoredUser;
      }
    }

    if (patch.siteIds !== undefined || patch.machineIds !== undefined) {
      const known = new Set(
        activeSites(filterByTenant(db.sites ?? [], tenantId)).map((site) => site.id),
      );
      const validMachines = filterByTenant(db.machines, tenantId).map((machine) => ({
        id: machine.id,
        siteId: machine.siteId,
      }));
      const rawGrant = {
        siteIds: [
          ...new Set((patch.siteIds ?? user.siteIds ?? []).filter((id) => known.has(id))),
        ],
        machineIds: [
          ...new Set(
            (patch.machineIds ?? user.machineIds ?? []).filter((id) =>
              validMachines.some((machine) => machine.id === id),
            ),
          ),
        ],
      };
      const normalized = normalizeAccessGrant(rawGrant, validMachines);
      next = {
        ...next,
        siteIds: normalized.siteIds,
        companyAccess: undefined,
        machineIds: normalized.machineIds,
      };
    }

    const users = db.users.slice();
    users[index] = next;
    await writeDatabase({ ...db, users });
    return { user: next };
  });
}

/** @deprecated Use updatePerson */
export const updateCustomerSites = updatePerson;

export function updateMachine(
  machineId: string,
  tenantId: string,
  patch: { name?: string; siteId?: string | null; part?: StaffPartEdit },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.machines.findIndex(
      (machine) => machine.id === machineId && belongsToTenant(machine, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    if (patch.siteId !== undefined && patch.siteId) {
      if (
        !(db.sites ?? []).some(
          (site) =>
            site.id === patch.siteId && !site.deletedAt && belongsToTenant(site, tenantId),
        )
      ) {
        return { error: "bad-site" as const };
      }
    }
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) {
        return { error: "bad-name" as const };
      }
    }

    const machines = db.machines.slice();
    const current = machines[index];
    let next = current;
    if (patch.siteId !== undefined) {
      next =
        patch.siteId
          ? { ...next, siteId: patch.siteId }
          : { ...next, siteId: undefined };
    }
    if (patch.name !== undefined) {
      next = { ...next, name: patch.name.trim() };
    }
    if (patch.part) {
      let meshNames = knownMeshNames(next.parts, next.unmatched);
      try {
        const bytes = await readModelFile(next.storedFileName);
        if (bytes?.length) {
          meshNames = extractMeshNames(bytes, next.originalFileName);
        }
      } catch {
        // Keep names reconstructed from the stored catalog.
      }
      const edited = applyStaffPartEdit({
        parts: next.parts,
        unmatched: next.unmatched,
        meshNames,
        edit: patch.part,
      });
      if ("error" in edited) {
        return { error: "bad-part" as const, message: edited.error };
      }
      next = {
        ...next,
        parts: edited.parts,
        unmatched: edited.unmatched,
        version: (next.version ?? 1) + 1,
        revisedAt: new Date().toISOString(),
      };
    }
    machines[index] = next;
    await writeDatabase({ ...db, machines });
    return { machine: next };
  });
}

export function updateMachineSite(
  machineId: string,
  tenantId: string,
  siteId: string | null,
) {
  return updateMachine(machineId, tenantId, { siteId });
}

export function deleteMachine(machineId: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.machines.findIndex(
      (machine) => machine.id === machineId && belongsToTenant(machine, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const machine = db.machines[index];
    const machines = db.machines.filter((row) => row.id !== machineId);
    const users = db.users.map((user) => {
      if (!user.machineIds?.includes(machineId)) {
        return user;
      }
      return {
        ...user,
        machineIds: user.machineIds.filter((id) => id !== machineId),
      };
    });
    const machineViews = (db.machineViews ?? []).filter(
      (view) => view.machineId !== machineId,
    );
    const care = careCollections(db);
    const removedManuals = care.manuals.filter((row) => row.machineId === machineId);
    const manuals = care.manuals.filter((row) => row.machineId !== machineId);
    const tickets = care.tickets.filter((row) => row.machineId !== machineId);
    const machineUsage = care.machineUsage.filter((row) => row.machineId !== machineId);
    await writeDatabase({
      ...db,
      machines,
      users,
      machineViews,
      manuals,
      tickets,
      machineUsage,
    });
    await deleteStoredFile(machine.storedFileName);
    for (const manual of removedManuals) {
      await deleteManualFile(manual.storedFileName);
    }
    return { ok: true as const };
  });
}

function machinesForTenantListing(db: Database, tenantId: string) {
  let rows = filterByTenant(db.machines, tenantId);
  if (!isSeedAllowed() || tenantId !== DEFAULT_TENANT_ID) {
    return rows;
  }
  const seen = new Set(rows.map((row) => row.id));
  for (const machine of db.machines) {
    if (!HOST_SEED_MACHINE_IDS.has(machine.id) || seen.has(machine.id)) {
      continue;
    }
    rows = [...rows, { ...machine, tenantId: DEFAULT_TENANT_ID }];
    seen.add(machine.id);
  }
  return rows;
}

export function listMachines(tenantId: string, options?: { heal?: boolean }) {
  return withLock(async () => {
    if (options?.heal) {
      memory = null;
    }
    const db = await ensureCatalog({ restoreFiles: options?.heal });
    return machinesForTenantListing(db, tenantId).map((machine) => ({
      id: machine.id,
      name: machine.name,
      siteId: machine.siteId,
      tenantId: machine.tenantId,
      version: machine.version ?? 1,
    }));
  });
}

export function getMachine(id: string, tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const machine = db.machines.find((machine) => machine.id === id) ?? null;
    if (!machine || !belongsToTenant(machine, tenantId)) {
      return null;
    }
    return machine;
  });
}

export function listMachineModelFiles(tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return filterByTenant(db.machines, tenantId).map((machine) => ({
      id: machine.id,
      name: machine.name,
      storedFileName: machine.storedFileName,
    }));
  });
}

/** Test helper: drop the in-process cache so the next read hits disk. */
export function resetStoreMemoryForTests() {
  memory = null;
}

/** Test helper: simulate a stale catalog heal racing a persisted org delete. */
export function writeCatalogHealForTests(staleHeal: Database) {
  return writeCatalogHeal(staleHeal);
}

/** Test helper: simulate a warm instance that has users but no machines. */
export function seedEmptyMachineCatalogForTests(users: StoredUser[]) {
  memory = {
    users,
    machines: [],
    quotes: [],
    bugReports: [],
    sites: [],
    machineViews: [],
    manuals: [],
    tickets: [],
    machineUsage: [],
  };
}

export function createMachine(
  tenantId: string,
  input: {
    name: string;
    storedFileName: string;
    originalFileName: string;
    parts: Part[];
    unmatched: UnmatchedPart[];
    siteId?: string;
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const machine: StoredMachine = {
      id: randomUUID(),
      name: input.name,
      storedFileName: input.storedFileName,
      originalFileName: input.originalFileName,
      parts: input.parts,
      unmatched: input.unmatched,
      createdAt: new Date().toISOString(),
      siteId: input.siteId,
      tenantId,
      version: 1,
    };
    await writeDatabase({ ...db, machines: [...db.machines, machine] });
    return machine;
  });
}

export function replaceMachinePack(
  machineId: string,
  tenantId: string,
  input: {
    name?: string;
    storedFileName: string;
    originalFileName: string;
    parts: Part[];
    unmatched: UnmatchedPart[];
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.machines.findIndex(
      (machine) => machine.id === machineId && belongsToTenant(machine, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const current = db.machines[index];
    const previousFileName = current.storedFileName;
    const machines = db.machines.slice();
    machines[index] = {
      ...current,
      name: input.name?.trim() || current.name,
      storedFileName: input.storedFileName,
      originalFileName: input.originalFileName,
      parts: input.parts,
      unmatched: input.unmatched,
      version: (current.version ?? 1) + 1,
      revisedAt: new Date().toISOString(),
    };
    await writeDatabase({ ...db, machines });
    if (previousFileName !== input.storedFileName) {
      await deleteStoredFile(previousFileName);
    }
    return { machine: machines[index] };
  });
}

export function recordMachineView(input: {
  userId: string;
  email: string;
  machineId: string;
  tenantId: string;
}) {
  return withLock(async () => {
    const db = await readDatabase();
    const view: MachineView = {
      id: randomUUID(),
      at: new Date().toISOString(),
      userId: input.userId,
      email: input.email,
      machineId: input.machineId,
      tenantId: input.tenantId,
    };
    const machineViews = [view, ...(db.machineViews ?? [])].slice(0, 500);
    await writeDatabase({ ...db, machineViews });
    return view;
  });
}

export function listMachineViews(machineId: string, tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return (db.machineViews ?? []).filter(
      (row) => row.machineId === machineId && belongsToTenant(row, tenantId),
    );
  });
}

export function bulkUpdateCustomerAccess(
  tenantId: string,
  userIds: string[],
  access: { siteIds?: string[]; companyAccess?: string[] },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const known = new Set(
      activeSites(filterByTenant(db.sites ?? [], tenantId)).map((site) => site.id),
    );
    const wanted = new Set(userIds);
    const users = db.users.map((user) => {
      if (
        !wanted.has(user.id) ||
        user.role !== "customer" ||
        user.deletedAt ||
        !belongsToTenant(user, tenantId)
      ) {
        return user;
      }
      return {
        ...user,
        siteIds: [...new Set((access.siteIds ?? []).filter((id) => known.has(id)))],
        companyAccess: undefined,
      };
    });
    await writeDatabase({ ...db, users });
    return users.filter(
      (user) =>
        wanted.has(user.id) &&
        user.role === "customer" &&
        !user.deletedAt &&
        belongsToTenant(user, tenantId),
    );
  });
}

function newActivity(
  actor: { email: string; role: Role },
  kind: QuoteActivity["kind"],
  text: string,
  at = new Date().toISOString(),
  attachments?: QuoteActivity["attachments"],
): QuoteActivity {
  const activity: QuoteActivity = {
    id: randomUUID(),
    at,
    actorRole: actor.role,
    actorEmail: actor.email,
    kind,
    text,
  };
  if (attachments?.length) {
    activity.attachments = attachments;
  }
  return activity;
}

export function createQuote(
  tenantId: string,
  input: {
    machineId: string;
    items: QuoteItem[];
    note?: string;
    customerId: string;
    customerEmail: string;
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const machine = db.machines.find((row) => row.id === input.machineId);
    if (!machine || !belongsToTenant(machine, tenantId)) {
      return { error: "bad-machine" as const };
    }
    const now = new Date().toISOString();
    const activity = newActivity(
      { email: input.customerEmail, role: "customer" },
      "status",
      statusActivityText("requested"),
      now,
    );
    const quote: QuoteRecord = {
      id: randomUUID(),
      number: nextQuoteNumber(db.quotes),
      machineId: input.machineId,
      items: input.items,
      note: input.note,
      createdAt: now,
      customerEmail: input.customerEmail,
      customerId: input.customerId,
      tenantId,
      status: "requested",
      shipments: [],
      activities: [activity],
      lastReadAt: { [input.customerId]: now },
    };
    await writeDatabase({ ...db, quotes: [...db.quotes, quote] });
    return quote;
  });
}

export function listQuotes(tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    return filterByTenant(db.quotes, tenantId)
      .map((quote) => normalizeStoredQuote(quote))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export function getQuote(idOrNumber: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const quote = findQuoteInList(db.quotes, idOrNumber);
    if (!quote || !belongsToTenant(quote, tenantId)) {
      return null;
    }
    return quote;
  });
}

export function mutateQuote(
  idOrNumber: string,
  tenantId: string,
  fn: (quote: QuoteRecord) => QuoteRecord,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const current = findQuoteInList(db.quotes, idOrNumber);
    if (!current || !belongsToTenant(current, tenantId)) {
      return null;
    }
    const next = fn(current);
    await writeDatabase({
      ...db,
      quotes: db.quotes.map((quote) => (quote.id === current.id ? next : quote)),
    });
    return next;
  });
}

export function appendQuoteActivity(
  idOrNumber: string,
  tenantId: string,
  actor: { email: string; role: Role; id: string },
  kind: QuoteActivity["kind"],
  text: string,
  attachments?: QuoteActivity["attachments"],
) {
  return mutateQuote(idOrNumber, tenantId, (quote) => {
    const activity = newActivity(actor, kind, text, undefined, attachments);
    return {
      ...quote,
      activities: [...quote.activities, activity],
      lastReadAt: { ...quote.lastReadAt, [actor.id]: activity.at },
    };
  });
}

export function markQuoteRead(idOrNumber: string, tenantId: string, userId: string) {
  const now = new Date().toISOString();
  return mutateQuote(idOrNumber, tenantId, (quote) => ({
    ...quote,
    lastReadAt: { ...quote.lastReadAt, [userId]: now },
  }));
}

export { newActivity as createQuoteActivity };

function newTicketActivity(
  actor: { email: string; role: Role },
  kind: TicketActivity["kind"],
  text: string,
  at = new Date().toISOString(),
  attachments?: TicketActivity["attachments"],
): TicketActivity {
  const activity: TicketActivity = {
    id: randomUUID(),
    at,
    actorRole: actor.role,
    actorEmail: actor.email,
    kind,
    text,
  };
  if (attachments?.length) {
    activity.attachments = attachments;
  }
  return activity;
}

export function listManuals(machineId: string, tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return careCollections(db)
      .manuals.filter(
        (manual) => manual.machineId === machineId && belongsToTenant(manual, tenantId),
      )
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  });
}

export function getManual(machineId: string, manualId: string, tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const manual =
      careCollections(db).manuals.find(
        (manual) => manual.machineId === machineId && manual.id === manualId,
      ) ?? null;
    if (!manual || !belongsToTenant(manual, tenantId)) {
      return null;
    }
    return manual;
  });
}

export function createManual(
  tenantId: string,
  input: {
    machineId: string;
    title: string;
    category: ManualCategory;
    storedFileName: string;
    originalFileName: string;
    contentType: string;
    sizeBytes?: number;
    uploadedByEmail: string;
    bytes?: Buffer;
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const machine = db.machines.find((machine) => machine.id === input.machineId);
    if (!machine || !belongsToTenant(machine, tenantId)) {
      return { error: "not-found" as const };
    }
    if (input.bytes?.length) {
      await writeManualFile(input.storedFileName, input.bytes);
    }
    const now = new Date().toISOString();
    const manual: StoredManual = {
      id: randomUUID(),
      machineId: input.machineId,
      title: input.title,
      category: input.category,
      storedFileName: input.storedFileName,
      originalFileName: input.originalFileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedAt: now,
      uploadedByEmail: input.uploadedByEmail,
      tenantId,
    };
    const manuals = [manual, ...careCollections(db).manuals];
    await writeDatabase({ ...db, ...careCollections(db), manuals });
    return { manual };
  });
}

export function listTickets(tenantId: string, machineId?: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const tickets = filterByTenant(careCollections(db).tickets, tenantId).filter(
      (ticket) => (machineId ? ticket.machineId === machineId : true),
    );
    return tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export function getTicket(idOrNumber: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const ticket = findTicketInList(careCollections(db).tickets, idOrNumber);
    if (!ticket || !belongsToTenant(ticket, tenantId)) {
      return null;
    }
    return ticket;
  });
}

function findTicketInList(tickets: StoredTicket[], idOrNumber: string) {
  const byId = tickets.find((ticket) => ticket.id === idOrNumber);
  if (byId) {
    return byId;
  }
  if (!/^\d+$/.test(idOrNumber)) {
    return null;
  }
  const number = Number.parseInt(idOrNumber, 10);
  if (!Number.isFinite(number) || number < 1) {
    return null;
  }
  return tickets.find((ticket) => ticket.number === number) ?? null;
}

export function createTicket(
  tenantId: string,
  input: {
    machineId: string;
    title: string;
    customerId: string;
    customerEmail: string;
    actor: { email: string; role: Role; id: string };
    note?: string;
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const machine = db.machines.find((machine) => machine.id === input.machineId);
    if (!machine || !belongsToTenant(machine, tenantId)) {
      return { error: "not-found" as const };
    }
    const now = new Date().toISOString();
    const opened = newTicketActivity(
      input.actor,
      "status",
      statusTicketText("open"),
      now,
    );
    const activities = [opened];
    if (input.note) {
      activities.push(newTicketActivity(input.actor, "message", input.note, now));
    }
    const ticket: StoredTicket = {
      id: randomUUID(),
      number: nextTicketNumber(careCollections(db).tickets),
      machineId: input.machineId,
      title: input.title,
      status: "open",
      createdAt: now,
      customerId: input.customerId,
      customerEmail: input.customerEmail,
      tenantId,
      activities,
      lastReadAt: { [input.actor.id]: now },
    };
    await writeDatabase({
      ...db,
      ...careCollections(db),
      tickets: [ticket, ...careCollections(db).tickets],
    });
    return { ticket };
  });
}

function mutateTicket(
  idOrNumber: string,
  tenantId: string,
  fn: (ticket: StoredTicket) => StoredTicket,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const current = findTicketInList(careCollections(db).tickets, idOrNumber);
    if (!current || !belongsToTenant(current, tenantId)) {
      return null;
    }
    const next = fn(current);
    const tickets = careCollections(db).tickets.map((ticket) =>
      ticket.id === current.id ? next : ticket,
    );
    await writeDatabase({ ...db, ...careCollections(db), tickets });
    return next;
  });
}

export function updateTicketStatus(
  idOrNumber: string,
  tenantId: string,
  status: TicketStatus,
  actor: { email: string; role: Role; id: string },
) {
  return mutateTicket(idOrNumber, tenantId, (ticket) => {
    if (ticket.status === status) {
      return ticket;
    }
    const activity = newTicketActivity(actor, "status", statusTicketText(status));
    return {
      ...ticket,
      status,
      activities: [...ticket.activities, activity],
      lastReadAt: { ...ticket.lastReadAt, [actor.id]: activity.at },
    };
  });
}

export function appendTicketActivity(
  idOrNumber: string,
  tenantId: string,
  actor: { email: string; role: Role; id: string },
  text: string,
  attachments?: TicketActivity["attachments"],
) {
  return mutateTicket(idOrNumber, tenantId, (ticket) => {
    const activity = newTicketActivity(actor, "message", text, undefined, attachments);
    return {
      ...ticket,
      activities: [...ticket.activities, activity],
      lastReadAt: { ...ticket.lastReadAt, [actor.id]: activity.at },
    };
  });
}

export function markTicketRead(idOrNumber: string, tenantId: string, userId: string) {
  const now = new Date().toISOString();
  return mutateTicket(idOrNumber, tenantId, (ticket) => ({
    ...ticket,
    lastReadAt: { ...ticket.lastReadAt, [userId]: now },
  }));
}

export function getMachineUsage(machineId: string, tenantId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const row =
      careCollections(db).machineUsage.find((row) => row.machineId === machineId) ??
      null;
    if (!row || !belongsToTenant(row, tenantId)) {
      return null;
    }
    return row;
  });
}

function pickUsageField<T>(
  incoming: T | null | undefined,
  previous: T | undefined,
): T | undefined {
  if (incoming === null) {
    return undefined;
  }
  if (incoming === undefined) {
    return previous;
  }
  return incoming;
}

export function updateMachineUsage(
  machineId: string,
  tenantId: string,
  patch: {
    hours?: number | null;
    cycles?: number | null;
    lastServiceAt?: string | null;
    notes?: string | null;
  },
  actorEmail: string,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const machine = db.machines.find((machine) => machine.id === machineId);
    if (!machine || !belongsToTenant(machine, tenantId)) {
      return { error: "not-found" as const };
    }
    const now = new Date().toISOString();
    const current =
      careCollections(db).machineUsage.find((row) => row.machineId === machineId) ??
      null;
    const nextValues = {
      hours: pickUsageField(patch.hours, current?.hours),
      cycles: pickUsageField(patch.cycles, current?.cycles),
      lastServiceAt: pickUsageField(patch.lastServiceAt, current?.lastServiceAt),
      notes: pickUsageField(patch.notes, current?.notes),
    };
    const summary = usageSummary(current, nextValues);
    const historyEntry = {
      ...usageHistoryEntry(actorEmail, summary, now),
      id: randomUUID(),
    };
    const next: StoredUsage = {
      machineId,
      tenantId,
      ...nextValues,
      updatedAt: now,
      updatedByEmail: actorEmail,
      history: [historyEntry, ...(current?.history ?? [])].slice(0, 50),
    };
    const machineUsage = [
      next,
      ...careCollections(db).machineUsage.filter((row) => row.machineId !== machineId),
    ];
    await writeDatabase({ ...db, ...careCollections(db), machineUsage });
    return { usage: next };
  });
}

export function listBugReports(tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    return filterByTenant(db.bugReports, tenantId).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  });
}

export function getBugReport(id: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const report = db.bugReports.find((report) => report.id === id) ?? null;
    if (!report || !belongsToTenant(report, tenantId)) {
      return null;
    }
    return report;
  });
}

export function createBugReport(
  tenantId: string,
  input: {
    description: string;
    path: string;
    userAgent: string;
    userEmail?: string;
    userRole?: Role;
    logText: string;
    screenshot?: Buffer;
    githubIssueUrl?: string;
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const id = randomUUID();
    const screenshotFileName = input.screenshot?.length ? `bug-${id}.jpg` : "";
    if (input.screenshot?.length && screenshotFileName) {
      await persistFile(screenshotFileName, input.screenshot);
    }
    const report: StoredBugReport = {
      id,
      description: input.description,
      createdAt: new Date().toISOString(),
      path: input.path,
      userAgent: input.userAgent,
      userEmail: input.userEmail,
      userRole: input.userRole,
      tenantId,
      logText: input.logText,
      screenshotFileName,
      githubIssueUrl: input.githubIssueUrl,
      delivery: input.githubIssueUrl ? "github" : "store",
    };
    await writeDatabase({
      ...db,
      bugReports: [report, ...(db.bugReports ?? [])],
    });
    return report;
  });
}

export function attachBugReportGithubIssue(id: string, githubIssueUrl: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const reports = (db.bugReports ?? []).map((report) =>
      report.id === id
        ? { ...report, githubIssueUrl, delivery: "github" as const }
        : report,
    );
    await writeDatabase({ ...db, bugReports: reports });
    return reports.find((report) => report.id === id) ?? null;
  });
}

export function machineFilePath(storedFileName: string) {
  return `${filesDir()}/${safeStoredFileName(storedFileName)}`;
}

export async function readStoredFile(storedFileName: string): Promise<Buffer> {
  const name = safeStoredFileName(storedFileName);
  const bytes = isModelFilename(name)
    ? await readModelFile(name)
    : await getPersistence().readFileBytes(name);
  if (!bytes?.length) {
    throw new Error("Stored file not found");
  }
  return isModelFilename(name) ? prepareModelBytes(bytes) : bytes;
}

export function saveMachineFile(storedFileName: string, bytes: Buffer) {
  return withLock(async () => {
    await persistFile(storedFileName, bytes);
  });
}
