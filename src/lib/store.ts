import { randomUUID } from "node:crypto";
import { hashPassword, unusablePasswordHash, verifyPassword } from "./auth/password.ts";
import type { MicrosoftIdentity } from "./auth/microsoft.ts";
import {
  emailSsoDomain,
  findActiveTenantForSso,
  firstTakenSsoDomain,
  MICROSOFT_CONSUMER_TID,
  parseSsoDomains,
  parseSsoTenantIds,
  tenantEnrollsMicrosoftTenant,
} from "./auth/sso-domain.ts";
import {
  loginRenameConflicts,
  mergeIdLists,
  mergeRowsForWrite,
  mergeUsersForWrite,
} from "./catalog-merge.ts";
import {
  compressModelGlb,
  validateLargeModelCompression,
} from "./gltf-compress.ts";
import { extractMeshNames, prepareModelBytes } from "./gltf.ts";
import {
  findMachineByNameAtSite,
  isModelFilename,
  normalizeMachineName,
} from "./machines.ts";
import {
  deleteModelFile,
  readModelFile,
  writeModelFile,
} from "./model-storage.ts";
import {
  applyLifecycleUpsert,
  buildTenantPartCatalog,
  filterCatalogRows,
  healDemoPartLifecycle,
  parsePartLifecycleBulk,
  parsePartLifecyclePatch,
  type PartLifecycleStatus,
  type StoredPartLifecycle,
} from "./part-lifecycle.ts";
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
  bumpChatWatch,
  chatWatchChannel,
  conversationWatchChanged,
} from "./chat-watch.ts";
import { readWatermarkNow } from "./read-watermark.ts";
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
import { isProtectedDemoSeedLogin } from "./demo-seed-gate.ts";
import { migrateOrgTree } from "./org-migration.ts";
import { activeSites } from "./org.ts";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_VERSION,
  belongsToTenant,
  canAssignStaffAcrossTenants,
  effectiveStaffTenantId,
  effectiveTenantId,
  filterByTenant,
  platformOwnerEmails,
} from "./tenant.ts";
import { migrateTenants, newTenantFromName } from "./tenant-migration.ts";
import {
  assignMissingHostTicketMailboxes,
  ensureHostTicketMailbox,
  inboundLocalPartsChanged,
  takenInboundLocalParts,
} from "./care-ticket-email.ts";
import {
  buildPlatformDeploymentRow,
  computeTenantSizeMetrics,
  type PlatformCatalogSlice,
  type PlatformDeploymentRow,
  type TenantSizeMetrics,
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
import {
  StoredFileClaimedError,
  chatKeyClaimed,
  manualFileNameClaimed,
  modelFileNameClaimed,
} from "./stored-file-claim.ts";
import type {
  MachineManual,
  MachineUsage,
  MachineView,
  ManualCategory,
  Part,
  QuoteActivity,
  QuoteItem,
  QuoteRecord,
  ActivityActorRole,
  Role,
  CustomerAccount,
  ServiceTicketRecord,
  Site,
  TicketActivity,
  TicketStatus,
  UnmatchedPart,
} from "../types/index.ts";
import {
  readPersistedPlatformSettings,
  readPersistedPlatformSignInSettings,
  writePersistedPlatformSettings,
  writePersistedPlatformSignInSettings,
  type PlatformSettingsDocument,
  type PlatformSignInSettings,
} from "./platform-settings-persistence.ts";
import { normalizeAssistantSettings } from "./assistant/settings.ts";
import { resolveAssistantModel } from "./assistant/models.ts";

export { filesDir, getDataDir } from "./persistence.ts";
export type { PlatformSignInSettings, PlatformSettingsDocument };

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

/** Idempotent Preview-only quote for Quinn ConversationSheet smoke (#134). */
export const PREVIEW_QA_QUOTE_ID = "quote-preview-qa-conversation";

const PREVIEW_QA_QUOTE_NOTE =
  "Preview QA fixture for ConversationSheet smoke (not a real customer order).";

function previewQaQuoteId(tenantId: string) {
  return tenantId === DEFAULT_TENANT_ID ? PREVIEW_QA_QUOTE_ID : `quote-preview-qa-${tenantId}`;
}

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
  /** Set when Microsoft SSO created this staff from a host SSO domain. */
  ssoProvisionedAt?: string;
  /** Set on first Microsoft sign-in. Later sign-ins must present the same pair. */
  microsoftTid?: string;
  microsoftOid?: string;
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
  oem?: string;
  notes?: string;
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

export type StoredAccessInquiry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: import("./access-inquiry.ts").AccessInquiryStatus;
  fullName: string;
  workEmail: string;
  phone: string;
  companyName: string;
  website: string;
  roleTitle: string;
  scaleNotes: string;
  customerType: import("./access-inquiry.ts").AccessInquiryCustomerType;
  message: string;
  referralNotes: string;
  submitterIp?: string;
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
  accessInquiries?: StoredAccessInquiry[];
  sites: Site[];
  machineViews?: MachineView[];
  manuals?: StoredManual[];
  tickets?: StoredTicket[];
  machineUsage?: StoredUsage[];
  /** Per-tenant part number lifecycle (staff-maintained; hook for future manufacturer feeds). */
  partLifecycle?: StoredPartLifecycle[];
  orgTombstones?: OrgTombstones;
  /** Legacy; sign-in policy lives in platform-settings.json. */
  platformSettings?: PlatformSignInSettings;
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
    assistantPaused: a.assistantPaused || b.assistantPaused || newer.assistantPaused,
    assistantEscalatedAt:
      newer.assistantEscalatedAt ?? a.assistantEscalatedAt ?? b.assistantEscalatedAt,
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
    assistantPaused: a.assistantPaused || b.assistantPaused || newer.assistantPaused,
    assistantEscalatedAt:
      newer.assistantEscalatedAt ?? a.assistantEscalatedAt ?? b.assistantEscalatedAt,
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
  if (!storedFileName.trim()) {
    return;
  }
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
    schemaVersion: TENANT_SCHEMA_VERSION,
    tenants: [],
    customers: [],
    users: [],
    machines: [],
    quotes: [],
    bugReports: [],
    accessInquiries: [],
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
  const index = db.users.findIndex(
    (user) => normalizeEmail(user.email) === email,
  );
  if (index >= 0) {
    const current = db.users[index];
    // Hashes are salted, so compare by verifying — hashing again never matches and would
    // rewrite the owner row (and race other writers) on every single catalog read.
    if (
      current.role === "staff" &&
      !current.deletedAt &&
      (await verifyPassword(password, current.passwordHash))
    ) {
      return db;
    }
    const users = db.users.slice();
    const { deletedAt: _reactivated, ...live } = current;
    users[index] = {
      ...live,
      role: "staff",
      passwordHash: await hashPassword(password),
      tenantId: current.tenantId ?? DEFAULT_TENANT_ID,
      staffCreatedTenantId: current.staffCreatedTenantId ?? DEFAULT_TENANT_ID,
    };
    return { ...db, users };
  }
  const passwordHash = await hashPassword(password);
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

/** Preview catalog heal must keep the demo staff login on the Soft Launch host. */
async function ensureBuiltinDemoStaff(db: Database): Promise<Database> {
  if (!isSeedAllowed()) {
    return db;
  }
  const email = normalizeEmail(SEED_STAFF.email);
  const index = db.users.findIndex((user) => normalizeEmail(user.email) === email);
  const seeded = await seedUser(SEED_STAFF);
  const canonical: StoredUser = {
    ...seeded,
    tenantId: DEFAULT_TENANT_ID,
    staffCreatedTenantId: DEFAULT_TENANT_ID,
  };
  if (index < 0) {
    const users = db.users.filter((user) => user.id !== SEED_STAFF.id);
    return { ...db, users: [...users, canonical] };
  }
  const current = db.users[index];
  let next: StoredUser = current;
  if (current.deletedAt) {
    const { deletedAt: _removed, ...rest } = current;
    next = rest as StoredUser;
  }
  if (
    !current.deletedAt &&
    current.id === SEED_STAFF.id &&
    current.role === "staff" &&
    (current.tenantId ?? DEFAULT_TENANT_ID) === DEFAULT_TENANT_ID &&
    (current.staffCreatedTenantId ?? DEFAULT_TENANT_ID) === DEFAULT_TENANT_ID &&
    current.passwordHash === canonical.passwordHash
  ) {
    return db;
  }
  const patched: StoredUser = {
    ...next,
    id: SEED_STAFF.id,
    email: SEED_STAFF.email,
    role: "staff",
    tenantId: DEFAULT_TENANT_ID,
    staffCreatedTenantId: DEFAULT_TENANT_ID,
    passwordHash: canonical.passwordHash,
  };
  const users = db.users.slice();
  users[index] = patched;
  return { ...db, users };
}

/** Documented demo customer login; only this row is added when missing (never real logins). */
async function ensureBuiltinDemoCustomer(db: Database): Promise<Database> {
  if (!isSeedAllowed()) {
    return db;
  }
  const seed = SEED_CUSTOMER;
  const index = db.users.findIndex((user) => normalizeEmail(user.email) === seed.email);
  if (index >= 0) {
    return db;
  }
  const usedIds = new Set(db.users.map((user) => user.id));
  const id = usedIds.has(seed.id) ? randomUUID() : seed.id;
  return {
    ...db,
    users: [
      ...db.users,
      {
        ...(await seedUser({ ...seed, id })),
        tenantId: DEFAULT_TENANT_ID,
      },
    ],
  };
}

function stabilizeSeedUsers(db: Database): Database {
  const idByEmail = new Map<string, string>([
    [SEED_STAFF.email, SEED_STAFF.id],
    [SEED_CUSTOMER.email, SEED_CUSTOMER.id],
    ...EXTRA_SEED_CUSTOMERS.map((row) => [row.email, row.id] as const),
  ]);
  const takenIds = new Map(db.users.map((user) => [user.id, user.email]));
  const remap = new Map<string, string>();
  const users = db.users.map((user) => {
    const stable = idByEmail.get(user.email);
    if (!stable || user.id === stable) {
      return user;
    }
    // Never collide with a different person already holding the canonical id.
    const holder = takenIds.get(stable);
    if (holder !== undefined && holder !== user.email) {
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
  if (latest.deletedAt) {
    return latest;
  }
  if (healed.deletedAt) {
    return healed;
  }
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
  return mergeRowsForWrite(latest ?? [], healed ?? []);
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
      // Latest wins per row (the blob is newer than this heal's snapshot) but rows only
      // one side knows about are kept, so neither side loses a create.
      customers: mergeRowsForWrite(latest.customers ?? [], healed.customers ?? []),
      sites: mergeRowsForWrite(latest.sites ?? [], healed.sites ?? []),
      users: mergeOrgUsersAndClampTenants(
        healed,
        latest,
        mergeUsersForHeal(healed.users, latest.users),
      ),
      quotes: unionQuotes(healed.quotes, latest.quotes ?? []),
      bugReports: latest.bugReports ?? healed.bugReports,
      accessInquiries: mergeRowsForWrite(
        healed.accessInquiries ?? [],
        latest.accessInquiries ?? [],
      ),
      orgTombstones: mergeOrgTombstones(healed.orgTombstones, latest.orgTombstones),
      platformSettings: latest.platformSettings ?? healed.platformSettings,
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
    hostSeedMachineTenantsChanged(before, after) ||
    inboundLocalPartsChanged(before.tenants, after.tenants)
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
    await ensureBuiltinDemoCustomer(
      await ensureBuiltinDemoStaff(await ensureExtraCustomers(stabilizeSeedUsers(db))),
    ),
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
  const kept = await overlayPersistedCare(healDemoPartLifecycle(next));
  if (catalogChanged(db, kept)) {
    await writeCatalogHeal(kept);
    return kept;
  }
  if ((kept.partLifecycle?.length ?? 0) !== (db.partLifecycle?.length ?? 0)) {
    await writeDatabase(kept);
    memory = kept;
    return kept;
  }
  memory = kept;
  return kept;
}

type LoadedDatabase = { db: Database; numbersAssigned: boolean };

/**
 * The stored catalog could not be understood. Never reseed on this — an unreadable or
 * half-written `db.json` is recoverable from a backup, an overwritten one is not.
 */
export class CatalogUnreadableError extends Error {
  constructor() {
    super(
      "Stored catalog JSON could not be parsed. Refusing to overwrite it — restore db.json from a backup (docs/soft-launch-backup.md).",
    );
    this.name = "CatalogUnreadableError";
  }
}

function parseDatabase(raw: string): LoadedDatabase | null {
  try {
    const parsed = JSON.parse(raw) as Database;
    // An empty user list is a valid catalog (seeds off, no owner yet). Only a document
    // that is not a catalog at all is rejected.
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.users)) {
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
        accessInquiries: parsed.accessInquiries ?? [],
        sites: parsed.sites ?? [],
        machineViews: parsed.machineViews ?? [],
        manuals: parsed.manuals ?? [],
        tickets: parsed.tickets ?? [],
        machineUsage: parsed.machineUsage ?? [],
        partLifecycle: parsed.partLifecycle ?? [],
        orgTombstones: parsed.orgTombstones,
        platformSettings: parsed.platformSettings,
      },
      numbersAssigned: rawQuotes.some(
        (quote) => typeof quote.number !== "number" || quote.number < 1,
      ),
    };
  } catch {
    return null;
  }
}

/** Throws {@link CatalogUnreadableError} rather than treating bad JSON as an empty store. */
async function loadPersistedSnapshot(): Promise<LoadedDatabase | null> {
  const raw = await getPersistence().readDatabaseJson();
  if (raw === null) {
    return null;
  }
  const loaded = parseDatabase(raw);
  if (!loaded) {
    throw new CatalogUnreadableError();
  }
  return loaded;
}

async function readDatabase(): Promise<Database> {
  logStoreKind();
  if (memory && trustProcessMemory()) {
    return memory;
  }

  const loaded = await loadPersistedSnapshot();
  if (!loaded) {
    const base = isSeedAllowed() ? await seedDatabase() : await emptyDatabase();
    const seeded = await overlayPersistedCare(
      await withFixtureMachines(await ensureOwnerStaff(base)),
    );
    // Another instance may have created the catalog while we were building fixtures.
    const appeared = await loadPersistedSnapshot();
    if (appeared) {
      return await healLoadedDatabase(appeared);
    }
    await writeDatabase(seeded);
    return seeded;
  }
  return await healLoadedDatabase(loaded);
}

async function healLoadedDatabase(loaded: LoadedDatabase): Promise<Database> {
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
    (next.schemaVersion ?? 1) !== (loaded.db.schemaVersion ?? 1) ||
    inboundLocalPartsChanged(loaded.db.tenants, next.tenants)
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

async function persistDatabase(next: Database) {
  const normalized = applyCare(clampSatelliteStaffTenants(next), careCollections(next));
  memory = normalized;
  await Promise.all([
    getPersistence().writeDatabaseJson(JSON.stringify(normalized, null, 2)),
    writeCareStore(careCollections(normalized)),
  ]);
}

function mergeOrgTombstones(
  latest: OrgTombstones | undefined,
  next: OrgTombstones | undefined,
): OrgTombstones | undefined {
  const customerIds = mergeIdLists(latest?.customerIds, next?.customerIds);
  const siteIds = mergeIdLists(latest?.siteIds, next?.siteIds);
  if (!customerIds && !siteIds) {
    return undefined;
  }
  return {
    ...(customerIds ? { customerIds } : {}),
    ...(siteIds ? { siteIds } : {}),
  };
}

/**
 * Keep people, hosts, and the org tree that landed in the store after this request read
 * it. Without this, an unrelated write (a machine view, a quote, a Preview smoke renaming
 * a host) silently dropped every login created since its own snapshot.
 */
async function mergeIdentityWithLatest(next: Database): Promise<Database> {
  const latest = (await loadPersistedSnapshot())?.db;
  if (!latest) {
    return next;
  }
  return {
    ...next,
    tenants: mergeRowsForWrite(latest.tenants ?? [], next.tenants ?? []),
    users: mergeUsersForWrite(latest.users, next.users),
    customers: mergeRowsForWrite(latest.customers ?? [], next.customers ?? []),
    sites: mergeRowsForWrite(latest.sites ?? [], next.sites ?? []),
    orgTombstones: mergeOrgTombstones(latest.orgTombstones, next.orgTombstones),
    partLifecycle: mergeRowsForWrite(latest.partLifecycle ?? [], next.partLifecycle ?? []),
    platformSettings: next.platformSettings ?? latest.platformSettings,
  };
}

async function writeDatabase(next: Database) {
  await persistDatabase(await mergeIdentityWithLatest(next));
}

type LoginWriteResult = { ok: true } | { error: "email-taken" };

/**
 * Creating or renaming a login has to lose to a concurrent writer that already used the
 * address: two live rows with one email make `findUserByEmail` ambiguous and sign-in
 * fails closed for both people.
 */
async function writeDatabaseWithLogin(
  next: Database,
  login: { id: string; email: string },
): Promise<LoginWriteResult> {
  const merged = await mergeIdentityWithLatest(next);
  const latest = (await loadPersistedSnapshot())?.db;
  if (loginRenameConflicts(latest?.users, merged.users, login)) {
    return { error: "email-taken" };
  }
  await persistDatabase(merged);
  return { ok: true };
}

/** Org creates race catalog heals — merge with latest blob before persisting. */
async function writeDatabaseWithOrgMerge(
  next: Database,
  login?: { id: string; email: string },
): Promise<LoginWriteResult> {
  let merged = clampSatelliteStaffTenants(next);
  for (let pass = 0; pass < 2; pass++) {
    const latest = (await loadPersistedSnapshot())?.db;
    if (!latest) {
      break;
    }
    merged = clampSatelliteStaffTenants(mergeOrgCrudFromLatest(merged, latest));
  }
  const latest = (await loadPersistedSnapshot())?.db;
  if (login && loginRenameConflicts(latest?.users, merged.users, login)) {
    return { error: "email-taken" };
  }
  await persistDatabase(merged);
  return { ok: true };
}

/** Org deletes race catalog heals on Preview — re-merge with the blob like creates do. */
async function writeDatabaseWithOrgDelete(next: Database) {
  let merged = clampSatelliteStaffTenants(next);
  for (let pass = 0; pass < 2; pass++) {
    const latest = (await loadPersistedSnapshot())?.db;
    if (!latest) {
      break;
    }
    merged = clampSatelliteStaffTenants(mergeOrgCrudFromLatest(merged, latest));
  }
  await persistDatabase(merged);
}

/** Catalog/seed heals rewrite db.json — never replace the Care sidecar. */
async function writeCatalogHeal(next: Database) {
  let merged = next;
  for (let pass = 0; pass < 2; pass++) {
    const latest = (await loadPersistedSnapshot())?.db;
    if (!latest) {
      break;
    }
    merged = mergeOrgCrudFromLatest(merged, latest);
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

type MicrosoftCatalogResolution =
  | { user: StoredUser; provisioned: boolean }
  | { error: "unknown" | "identity-mismatch" };

/**
 * Microsoft sign-in. An existing row wins when a claim names it and either the IdP verified
 * the address or the row's host enrolled the token tid. The first match binds tid+oid; later
 * sign-ins must present the same pair. Otherwise a work email autoroutes onto the one host
 * that enrolled both its domain and the tid.
 */
export function resolveMicrosoftCatalogUser(
  identity: MicrosoftIdentity,
): Promise<MicrosoftCatalogResolution> {
  return withLock(async () => {
    const db = await ensureCatalog();
    const tenants = db.tenants ?? [];
    const tenantById = new Map(tenants.map((row) => [row.id, row]));

    for (const claim of identity.emails) {
      const matches = db.users.filter(
        (user) => user.email === claim.email && !user.deletedAt,
      );
      if (matches.length > 1) {
        return { error: "unknown" as const };
      }
      if (matches.length === 0) {
        continue;
      }
      const user = matches[0];
      if (
        user.microsoftTid &&
        (user.microsoftTid !== identity.tid || user.microsoftOid !== identity.oid)
      ) {
        return { error: "identity-mismatch" as const };
      }
      const host = tenantById.get(effectiveStaffTenantId(user) ?? "");
      if (!claim.verified && !tenantEnrollsMicrosoftTenant(host, identity.tid)) {
        continue;
      }
      if (user.microsoftTid) {
        return { user, provisioned: false as const };
      }
      const bound: StoredUser = {
        ...user,
        microsoftTid: identity.tid,
        microsoftOid: identity.oid,
      };
      await writeDatabaseWithOrgMerge({
        ...db,
        users: db.users.map((row) => (row.id === user.id ? bound : row)),
      });
      const persisted = (memory ?? (await readDatabase())).users.find(
        (row) => row.id === user.id,
      );
      return { user: persisted ?? bound, provisioned: false as const };
    }

    if (identity.tid === MICROSOFT_CONSUMER_TID) {
      return { error: "unknown" as const };
    }
    for (const claim of identity.emails) {
      const domain = emailSsoDomain(claim.email);
      const tenant = domain
        ? findActiveTenantForSso(tenants, { domain, tid: identity.tid })
        : null;
      if (!tenant) {
        continue;
      }
      const user: StoredUser = {
        id: randomUUID(),
        email: claim.email,
        passwordHash: await unusablePasswordHash(),
        role: "staff",
        tenantId: tenant.id,
        staffCreatedTenantId: tenant.id,
        ssoProvisionedAt: new Date().toISOString(),
        microsoftTid: identity.tid,
        microsoftOid: identity.oid,
      };
      const written = await writeDatabaseWithOrgMerge(
        { ...db, users: [...db.users, user] },
        { id: user.id, email: user.email },
      );
      if ("error" in written) {
        const raced = (memory ?? (await readDatabase())).users.find(
          (row) => row.email === claim.email && !row.deletedAt,
        );
        return raced
          ? { user: raced, provisioned: false as const }
          : { error: "unknown" as const };
      }
      const persisted = (memory ?? (await readDatabase())).users.find(
        (row) => row.id === user.id,
      );
      return { user: persisted ?? user, provisioned: true as const };
    }
    return { error: "unknown" as const };
  });
}

async function persistMissingHostTicketMailboxes(db: Database): Promise<Database> {
  const assigned = assignMissingHostTicketMailboxes(db.tenants ?? []);
  if (!assigned.changed) {
    return db;
  }
  const next = { ...db, tenants: assigned.tenants };
  await writeDatabase(next);
  return memory ?? next;
}

export function listTenants() {
  return withLock(async () => {
    const db = await persistMissingHostTicketMailboxes(await ensureCatalog());
    return [...(db.tenants ?? [])]
      .filter((row) => !row.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name));
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
    const db = await persistMissingHostTicketMailboxes(await ensureCatalog());
    const catalog = platformCatalogSlice(db);
    const tenants = [...(db.tenants ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return tenants
      .filter((tenant) => !tenant.deletedAt)
      .map((tenant) => buildPlatformDeploymentRow(tenant, catalog));
  });
}

export function listPlatformDirectory() {
  return withLock(async () => {
    const db = await ensureCatalog();
    return buildPlatformDirectory({
      tenants: (db.tenants ?? []).filter((row) => !row.deletedAt),
      customers: db.customers ?? [],
      users: db.users,
    });
  });
}

export type { DirectoryEntry };

export function getPlatformDeployment(tenantId: string) {
  return withLock(async () => {
    const db = await persistMissingHostTicketMailboxes(await ensureCatalog());
    const tenant = (db.tenants ?? []).find((row) => row.id === tenantId && !row.deletedAt);
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

export async function getPlatformSignInSettingsFromCatalog(): Promise<PlatformSignInSettings> {
  const sidecar = await readPersistedPlatformSignInSettings();
  if (sidecar) {
    return sidecar;
  }
  const legacy = (await readDatabase()).platformSettings;
  if (legacy?.passwordLoginEnabled !== undefined) {
    await writePersistedPlatformSignInSettings(legacy);
    return legacy;
  }
  return {};
}

export function updatePlatformSignInSettings(patch: { passwordLoginEnabled: boolean }) {
  return withLock(async () => {
    const current = await getPlatformSignInSettingsFromCatalog();
    const nextSettings: PlatformSignInSettings = {
      ...current,
      passwordLoginEnabled: patch.passwordLoginEnabled,
    };
    await writePersistedPlatformSignInSettings(nextSettings);
    return { settings: nextSettings };
  });
}

export async function getPlatformAssistantSettingsFromCatalog() {
  const sidecar = await readPersistedPlatformSettings();
  return normalizeAssistantSettings(sidecar);
}

export function updatePlatformAssistantSettings(patch: {
  enabled: boolean;
  model?: string;
}) {
  return withLock(async () => {
    const next = await writePersistedPlatformSettings({
      assistantEnabled: patch.enabled,
      assistantModel: resolveAssistantModel(patch.model),
    });
    return { settings: normalizeAssistantSettings(next) };
  });
}

function attachSsoDomains(
  tenants: readonly Tenant[],
  domains: string[] | undefined,
  exceptTenantId?: string,
):
  | { ok: true; ssoDomains?: string[] }
  | { ok: false; error: "invalid" | "domain-taken" } {
  if (domains === undefined) {
    return { ok: true };
  }
  const parsed = parseSsoDomains(domains);
  if (!parsed.ok) {
    return { ok: false, error: "invalid" };
  }
  if (firstTakenSsoDomain(tenants, parsed.domains, exceptTenantId)) {
    return { ok: false, error: "domain-taken" };
  }
  return {
    ok: true,
    ssoDomains: parsed.domains.length > 0 ? parsed.domains : undefined,
  };
}

function withSsoDomains(tenant: Tenant, ssoDomains: string[] | undefined): Tenant {
  if (ssoDomains && ssoDomains.length > 0) {
    return { ...tenant, ssoDomains };
  }
  const { ssoDomains: _removed, ...rest } = tenant;
  return rest;
}

function withSsoTenantIds(tenant: Tenant, ssoTenantIds: string[] | undefined): Tenant {
  if (ssoTenantIds && ssoTenantIds.length > 0) {
    return { ...tenant, ssoTenantIds };
  }
  const rest = { ...tenant };
  delete rest.ssoTenantIds;
  return rest;
}

function withSsoAutoroute(tenant: Tenant, ssoAutoroute: boolean | undefined): Tenant {
  if (ssoAutoroute === undefined) {
    return tenant;
  }
  if (ssoAutoroute) {
    return { ...tenant, ssoAutoroute: true };
  }
  const { ssoAutoroute: _removed, ...rest } = tenant;
  return rest;
}

type SsoEnrollment = {
  ssoDomains?: string[];
  ssoTenantIds?: string[];
  ssoAutoroute?: boolean;
};

type SsoEnrollmentError = "invalid" | "domain-taken" | "autoroute-needs-enrollment";

/** Autoroute needs a domain and an Entra tenant on the same row. Legacy rows keep their flag. */
function applySsoEnrollment(
  tenant: Tenant,
  tenants: readonly Tenant[],
  patch: SsoEnrollment,
  exceptTenantId?: string,
): { ok: true; tenant: Tenant } | { ok: false; error: SsoEnrollmentError } {
  let next = tenant;
  if (patch.ssoDomains !== undefined) {
    const assigned = attachSsoDomains(tenants, patch.ssoDomains, exceptTenantId);
    if (!assigned.ok) {
      return assigned;
    }
    next = withSsoDomains(next, assigned.ssoDomains);
  }
  if (patch.ssoTenantIds !== undefined) {
    const parsed = parseSsoTenantIds(patch.ssoTenantIds);
    if (!parsed.ok) {
      return { ok: false, error: "invalid" };
    }
    next = withSsoTenantIds(next, parsed.tenantIds);
  }
  next = withSsoAutoroute(next, patch.ssoAutoroute);
  if (
    patch.ssoAutoroute === true &&
    (!next.ssoDomains?.length || !next.ssoTenantIds?.length)
  ) {
    return { ok: false, error: "autoroute-needs-enrollment" };
  }
  return { ok: true, tenant: next };
}

export function updateTenantPlatformMeta(
  tenantId: string,
  patch: {
    name?: string;
    inactive?: boolean;
    ticketEmailDisplay?: string | null;
  } & SsoEnrollment,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = (db.tenants ?? []).findIndex(
      (row) => row.id === tenantId && !row.deletedAt,
    );
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

    const enrolled = applySsoEnrollment(next, tenants, patch, tenantId);
    if (!enrolled.ok) {
      return { error: enrolled.error };
    }
    next = enrolled.tenant;

    if (patch.inactive === true) {
      if (tenantId === DEFAULT_TENANT_ID) {
        return { error: "host-immutable" as const };
      }
      next = { ...next, inactiveAt: new Date().toISOString() };
    } else if (patch.inactive === false) {
      const { inactiveAt: _, ...rest } = next;
      next = rest as Tenant;
    }

    if (patch.ticketEmailDisplay !== undefined) {
      if (patch.ticketEmailDisplay) {
        next = { ...next, ticketEmailDisplay: patch.ticketEmailDisplay };
      } else {
        const { ticketEmailDisplay: _removed, ...rest } = next;
        next = rest;
      }
    }

    const takenInbound = takenInboundLocalParts(tenants, tenantId);
    const currentLocal = next.ticketInboundLocalPart?.trim().toLowerCase();
    if (currentLocal && takenInbound.has(currentLocal)) {
      return { error: "local-part-taken" as const };
    }
    next = ensureHostTicketMailbox(next, takenInbound).tenant;

    tenants[index] = next;
    await writeDatabase({ ...db, tenants });
    return { tenant: next };
  });
}

function catalogSliceFromDb(db: Database): PlatformCatalogSlice {
  return {
    users: db.users,
    customers: db.customers,
    sites: db.sites,
    machines: db.machines,
    quotes: db.quotes,
    tickets: db.tickets,
    machineUsage: db.machineUsage,
  };
}

function locateCustomerAccountInDb(db: Database, customerId: string) {
  const account =
    (db.customers ?? []).find((row) => row.id === customerId && !row.deletedAt) ?? null;
  if (!account) {
    return null;
  }
  const tenantId = effectiveTenantId(account);
  const tenant = (db.tenants ?? []).find((row) => row.id === tenantId);
  return { account, tenantId, hostName: tenant?.name ?? tenantId };
}

function locateSiteInDb(db: Database, siteId: string) {
  const site = activeSites(db.sites ?? []).find((row) => row.id === siteId) ?? null;
  if (!site) {
    return null;
  }
  const tenantId = effectiveTenantId(site);
  const tenant = (db.tenants ?? []).find((row) => row.id === tenantId);
  return { site, tenantId, hostName: tenant?.name ?? tenantId };
}

function tenantHasCatalogChildren(tenantId: string, db: Database) {
  const size = computeTenantSizeMetrics(tenantId, catalogSliceFromDb(db));
  if (
    size.staffUsers > 0 ||
    size.customerPeople > 0 ||
    size.customers > 0 ||
    size.sites > 0 ||
    size.machines > 0 ||
    size.openQuotes > 0 ||
    size.openTickets > 0
  ) {
    return { blocked: true as const, size };
  }
  const quotes = filterByTenant(db.quotes, tenantId).length;
  const tickets = filterByTenant(db.tickets ?? [], tenantId).length;
  const bugs = filterByTenant(db.bugReports, tenantId).length;
  if (quotes > 0 || tickets > 0 || bugs > 0) {
    return { blocked: true as const, size };
  }
  return { blocked: false as const, size };
}

export function getPlatformDirectoryCustomer(customerId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const located = locateCustomerAccountInDb(db, customerId);
    if (!located) {
      return { error: "not-found" as const };
    }
    const { account, tenantId, hostName } = located;
    const machines = filterByTenant(db.machines, tenantId);
    const machineCounts = new Map<string, number>();
    for (const machine of machines) {
      if (!machine.siteId) {
        continue;
      }
      machineCounts.set(machine.siteId, (machineCounts.get(machine.siteId) ?? 0) + 1);
    }
    const sites = activeSites(filterByTenant(db.sites ?? [], tenantId))
      .filter((site) => site.customerId === customerId)
      .map((site) => ({
        ...site,
        machineCount: machineCounts.get(site.id) ?? 0,
      }));
    return { account, tenantId, hostName, sites };
  });
}

export async function mutatePlatformDirectoryCustomer(
  customerId: string,
  patch: { name?: string },
) {
  const located = await getPlatformDirectoryCustomer(customerId);
  if ("error" in located) {
    return located;
  }
  return updateCustomerAccount(customerId, located.tenantId, patch);
}

export async function removePlatformCustomerAccount(customerId: string) {
  const located = await getPlatformDirectoryCustomer(customerId);
  if ("error" in located) {
    return located;
  }
  return deleteCustomerAccount(customerId, located.tenantId);
}

export async function removePlatformSite(siteId: string) {
  const located = await getPlatformDirectorySite(siteId);
  if ("error" in located) {
    return located;
  }
  return deleteSite(siteId, located.tenantId);
}

export function getPlatformDirectorySite(siteId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const located = locateSiteInDb(db, siteId);
    if (!located) {
      return { error: "not-found" as const };
    }
    return located;
  });
}

export function removePlatformTenant(tenantId: string) {
  return withLock(async () => {
    if (tenantId === DEFAULT_TENANT_ID) {
      return { error: "host-immutable" as const };
    }
    const db = await readDatabase();
    const index = (db.tenants ?? []).findIndex(
      (row) => row.id === tenantId && !row.deletedAt,
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const childCheck = tenantHasCatalogChildren(tenantId, db);
    if (childCheck.blocked) {
      return { error: "has-children" as const, size: childCheck.size };
    }
    const tenants = (db.tenants ?? []).slice();
    tenants[index] = { ...tenants[index], deletedAt: new Date().toISOString() };
    await writeDatabaseWithOrgDelete({ ...db, tenants });
    return { ok: true as const };
  });
}

export type { PlatformDeploymentRow, TenantSizeMetrics };

function tenantNameTaken(db: Database, trimmed: string) {
  const active = (db.tenants ?? []).filter((row) => !row.deletedAt);
  const slugTaken = active.some((row) => row.slug === newTenantFromName(trimmed).slug);
  const nameTaken = active.some((row) => row.name.toLowerCase() === trimmed.toLowerCase());
  return slugTaken || nameTaken;
}

type CreateTenantError = "taken" | "email-taken" | "local-part-taken" | SsoEnrollmentError;

function tenantWithUniqueMailbox(
  tenant: Tenant,
  tenants: readonly Tenant[],
): { tenant: Tenant } | { error: "local-part-taken" } {
  const taken = takenInboundLocalParts(tenants, tenant.id);
  const local = tenant.ticketInboundLocalPart?.trim().toLowerCase();
  if (local && taken.has(local)) {
    return { error: "local-part-taken" };
  }
  return { tenant: ensureHostTicketMailbox(tenant, taken).tenant };
}

export function createTenant(
  name: string,
  options?: SsoEnrollment,
): Promise<{ tenant: Tenant } | { error: CreateTenantError }> {
  return withLock(async () => {
    const db = await readDatabase();
    const trimmed = name.trim();
    if (!trimmed) {
      return { error: "invalid" as const };
    }
    if (tenantNameTaken(db, trimmed)) {
      return { error: "taken" as const };
    }
    const taken = takenInboundLocalParts(db.tenants ?? []);
    const enrolled = applySsoEnrollment(
      newTenantFromName(trimmed, new Date().toISOString(), taken),
      db.tenants ?? [],
      options ?? {},
    );
    if (!enrolled.ok) {
      return { error: enrolled.error };
    }
    const mailbox = tenantWithUniqueMailbox(enrolled.tenant, db.tenants ?? []);
    if ("error" in mailbox) {
      return mailbox;
    }
    const tenant = mailbox.tenant;
    await writeDatabase({
      ...db,
      schemaVersion: Math.max(db.schemaVersion ?? 1, TENANT_SCHEMA_VERSION),
      tenants: [...(db.tenants ?? []), tenant],
    });
    return { tenant };
  });
}

/** One write so first staff always shares the new tenant row (no heal gap). */
export function createTenantWithOptionalStaff(
  name: string,
  staff?: { email: string; passwordHash: string },
  options?: SsoEnrollment,
): Promise<
  { tenant: Tenant; staffUser?: StoredUser } | { error: CreateTenantError }
> {
  return withLock(async () => {
    const db = await readDatabase();
    const trimmed = name.trim();
    if (!trimmed) {
      return { error: "invalid" as const };
    }
    if (tenantNameTaken(db, trimmed)) {
      return { error: "taken" as const };
    }
    const taken = takenInboundLocalParts(db.tenants ?? []);
    const enrolled = applySsoEnrollment(
      newTenantFromName(trimmed, new Date().toISOString(), taken),
      db.tenants ?? [],
      options ?? {},
    );
    if (!enrolled.ok) {
      return { error: enrolled.error };
    }
    const mailbox = tenantWithUniqueMailbox(enrolled.tenant, db.tenants ?? []);
    if ("error" in mailbox) {
      return mailbox;
    }
    let tenant: Tenant = mailbox.tenant;
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
    const written = await writeDatabaseWithOrgMerge(
      payload,
      staffUser ? { id: staffUser.id, email: staffUser.email } : undefined,
    );
    if ("error" in written) {
      return { error: "email-taken" as const };
    }
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
    const written = await writeDatabaseWithOrgMerge(payload, {
      id: user.id,
      email: user.email,
    });
    if ("error" in written) {
      return { error: "email-taken" as const };
    }
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
    await writeDatabaseWithOrgDelete(
      withCustomerTombstone({ ...db, customers: next }, id),
    );
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
    const written = await writeDatabaseWithLogin(
      { ...db, users: [...db.users, user] },
      { id: user.id, email: user.email },
    );
    if ("error" in written) {
      return { error: "email-taken" as const };
    }
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
    if (isProtectedDemoSeedLogin(user.email)) {
      return { error: "protected" as const };
    }
    const users = db.users.slice();
    users[index] = { ...user, deletedAt: new Date().toISOString() };
    await writeDatabaseWithOrgDelete({ ...db, users });
    return { ok: true as const };
  });
}

export function deleteStaffUser(userId: string, tenantId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.users.findIndex(
      (user) => user.id === userId && belongsToTenant(user, tenantId),
    );
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const user = db.users[index];
    if (user.role !== "staff" || user.deletedAt) {
      return { error: "not-staff" as const };
    }
    if (isHostStaffEmail(user.email)) {
      return { error: "protected" as const };
    }
    const users = db.users.slice();
    users[index] = { ...user, deletedAt: new Date().toISOString() };
    await writeDatabaseWithOrgDelete({ ...db, users });
    return { ok: true as const };
  });
}

export function updateStaffProfile(
  userId: string,
  tenantId: string,
  patch: { name?: string | null; email?: string },
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
    if (user.role !== "staff" || user.deletedAt) {
      return { error: "not-staff" as const };
    }
    if (isHostStaffEmail(user.email)) {
      return { error: "protected" as const };
    }

    let next: StoredUser = { ...user };

    if (patch.email !== undefined) {
      const normalized = normalizeEmail(patch.email);
      if (!normalized) {
        return { error: "bad-email" as const };
      }
      if (
        db.users.some(
          (row) => row.id !== userId && row.email === normalized && !row.deletedAt,
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

    const users = db.users.slice();
    users[index] = next;
    const written = await writeDatabaseWithLogin({ ...db, users }, {
      id: next.id,
      email: next.email,
    });
    if ("error" in written) {
      return { error: "email-taken" as const };
    }
    return { user: next };
  });
}

function platformDirectoryUserTenantId(user: StoredUser) {
  if (user.role === "staff") {
    return effectiveStaffTenantId(user) ?? effectiveTenantId(user);
  }
  return effectiveTenantId(user);
}

export function getPlatformDirectoryUser(userId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const user = db.users.find((row) => row.id === userId && !row.deletedAt);
    if (!user || (user.role !== "customer" && user.role !== "staff")) {
      return { error: "not-found" as const };
    }
    const tenantId = platformDirectoryUserTenantId(user);
    const tenant = (db.tenants ?? []).find((row) => row.id === tenantId);
    const hostName = tenant?.name ?? tenantId;
    return { user, tenantId, hostName };
  });
}

export async function mutatePlatformDirectoryUser(
  userId: string,
  patch: {
    name?: string | null;
    email?: string;
    siteIds?: string[];
    machineIds?: string[];
  },
) {
  const located = await getPlatformDirectoryUser(userId);
  if ("error" in located) {
    return located;
  }
  const { user, tenantId } = located;
  if (user.role === "staff") {
    if (patch.siteIds !== undefined || patch.machineIds !== undefined) {
      return { error: "invalid" as const };
    }
    return updateStaffProfile(userId, tenantId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
    });
  }
  return updatePerson(userId, tenantId, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.siteIds !== undefined ? { siteIds: patch.siteIds } : {}),
    ...(patch.machineIds !== undefined ? { machineIds: patch.machineIds } : {}),
  });
}

export async function removePlatformDirectoryUser(userId: string) {
  const located = await getPlatformDirectoryUser(userId);
  if ("error" in located) {
    return located;
  }
  const { user, tenantId } = located;
  if (user.role === "staff") {
    return deleteStaffUser(userId, tenantId);
  }
  return deletePerson(userId, tenantId);
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
    await writeDatabaseWithOrgDelete(
      withSiteTombstone({ ...db, sites: updated, users }, siteId),
    );
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
      if (normalized !== user.email && isProtectedDemoSeedLogin(user.email)) {
        return { error: "protected" as const };
      }
      if (
        db.users.some(
          (row) => row.id !== userId && row.email === normalized && !row.deletedAt,
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

    if (patch.companyAccess !== undefined) {
      const companies = [
        ...new Set(patch.companyAccess.map((row) => row.trim()).filter(Boolean)),
      ];
      next = {
        ...next,
        companyAccess: companies.length > 0 ? companies : undefined,
      };
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
    const written = await writeDatabaseWithLogin({ ...db, users }, {
      id: next.id,
      email: next.email,
    });
    if ("error" in written) {
      return { error: "email-taken" as const };
    }
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
    if (!modelFileNameClaimed(machines, machine.storedFileName)) {
      await deleteStoredFile(machine.storedFileName);
    }
    for (const manual of removedManuals) {
      if (!manualFileNameClaimed(manuals, manual.storedFileName)) {
        await deleteManualFile(manual.storedFileName);
      }
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
      storedFileName: machine.storedFileName,
      oem: machine.oem,
      notes: machine.notes,
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

export function listPartLifecycleRows() {
  return withLock(async () => {
    const db = await ensureCatalog();
    return db.partLifecycle ?? [];
  });
}

export function listTenantPartLifecycleCatalog(
  tenantId: string,
  filters: {
    status?: PartLifecycleStatus | "all";
    machineId?: string;
    query?: string;
  } = {},
) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const machines = machinesForTenantListing(db, tenantId);
    const catalog = buildTenantPartCatalog(
      machines,
      db.partLifecycle ?? [],
      tenantId,
    );
    return filterCatalogRows(catalog, filters);
  });
}

export function upsertTenantPartLifecycle(
  tenantId: string,
  updates: Array<{ partNumber: string; patch: Partial<import("./part-lifecycle.ts").PartLifecycleFields> }>,
  actorEmail: string,
) {
  return withLock(async () => {
    const db = await ensureCatalog();
    const at = new Date().toISOString();
    let rows = db.partLifecycle ?? [];
    for (const update of updates) {
      rows = applyLifecycleUpsert({
        rows,
        tenantId,
        partNumber: update.partNumber,
        patch: update.patch,
        actorEmail,
        at,
      });
    }
    await writeDatabase({ ...db, partLifecycle: rows });
    return { ok: true as const };
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
    accessInquiries: [],
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
    storedFileName?: string;
    originalFileName?: string;
    parts?: Part[];
    unmatched?: UnmatchedPart[];
    siteId?: string;
    oem?: string;
    notes?: string;
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const storedFileName = input.storedFileName?.trim() ?? "";
    if (modelFileNameClaimed(db.machines, storedFileName)) {
      throw new StoredFileClaimedError("model");
    }
    const machine: StoredMachine = {
      id: randomUUID(),
      name: normalizeMachineName(input.name) || input.name,
      storedFileName,
      originalFileName: input.originalFileName?.trim() ?? "",
      parts: input.parts ?? [],
      unmatched: input.unmatched ?? [],
      createdAt: new Date().toISOString(),
      siteId: input.siteId,
      tenantId,
      version: 1,
    };
    if (input.oem?.trim()) {
      machine.oem = input.oem.trim();
    }
    if (input.notes?.trim()) {
      machine.notes = input.notes.trim();
    }
    await writeDatabase({ ...db, machines: [...db.machines, machine] });
    return machine;
  });
}

function withCustomerMachineGrant(
  db: Database,
  tenantId: string,
  userId: string | undefined,
  machine: StoredMachine,
): Database {
  if (!userId) {
    return db;
  }
  const index = db.users.findIndex(
    (user) => user.id === userId && belongsToTenant(user, tenantId),
  );
  if (index < 0) {
    return db;
  }
  const user = db.users[index];
  if (user.role !== "customer" || user.deletedAt) {
    return db;
  }
  if (canAccessMachine(user, machine, db.sites ?? [], db.customers ?? [])) {
    return db;
  }
  const hasSiteIds = (user.siteIds?.length ?? 0) > 0;
  const hasMachineIds = (user.machineIds?.length ?? 0) > 0;
  const hasCompanyAccess = (user.companyAccess?.length ?? 0) > 0;
  if (hasCompanyAccess && !hasSiteIds && !hasMachineIds) {
    // Company-wide legacy access: never narrow to a single machineId.
    return db;
  }
  const users = db.users.slice();
  users[index] = {
    ...user,
    siteIds: user.siteIds ?? [],
    machineIds: [...new Set([...(user.machineIds ?? []), machine.id])],
    companyAccess: undefined,
  };
  return { ...db, users };
}

export function grantCustomerMachine(
  tenantId: string,
  userId: string,
  machineId: string,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const machine = db.machines.find(
      (row) => row.id === machineId && belongsToTenant(row, tenantId),
    );
    if (!machine) {
      return { error: "not-found" as const };
    }
    const granted = withCustomerMachineGrant(db, tenantId, userId, machine);
    if (granted !== db) {
      await writeDatabase(granted);
    }
    return { ok: true as const };
  });
}

export function findOrCreateModelLessMachine(
  tenantId: string,
  input: {
    name: string;
    siteId: string;
    oem?: string;
    notes?: string;
    grantUserId?: string;
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const name = normalizeMachineName(input.name);
    if (!name) {
      return { error: "bad-name" as const };
    }
    const site = activeSites(db.sites ?? []).find(
      (row) => row.id === input.siteId && belongsToTenant(row, tenantId),
    );
    if (!site) {
      return { error: "bad-site" as const };
    }
    const existing = findMachineByNameAtSite(
      filterByTenant(db.machines, tenantId),
      name,
      site.id,
    );
    if (existing) {
      return { machine: existing, created: false };
    }

    const machine: StoredMachine = {
      id: randomUUID(),
      name,
      storedFileName: "",
      originalFileName: "",
      parts: [],
      unmatched: [],
      createdAt: new Date().toISOString(),
      siteId: site.id,
      tenantId,
      version: 1,
    };
    if (input.oem?.trim()) {
      machine.oem = input.oem.trim();
    }
    if (input.notes?.trim()) {
      machine.notes = input.notes.trim();
    }
    const created = {
      ...db,
      machines: [...db.machines, machine],
    };
    const granted = withCustomerMachineGrant(
      created,
      tenantId,
      input.grantUserId,
      machine,
    );
    await writeDatabase(granted);
    return { machine, created: true };
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
    if (modelFileNameClaimed(db.machines, input.storedFileName, machineId)) {
      return { error: "file-taken" as const };
    }
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
    if (
      previousFileName !== input.storedFileName &&
      !modelFileNameClaimed(machines, previousFileName)
    ) {
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
  actor: { email: string; role: ActivityActorRole },
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

export type EnsurePreviewQaQuoteResult =
  | { status: "disabled" }
  | { status: "no_machine" }
  | { status: "no_customer" }
  | { status: "exists"; quote: QuoteRecord }
  | { status: "created"; quote: QuoteRecord };

/** Preview / Soft Launch only (`SPARES_ALLOW_SEED`). One stable quote per tenant. */
export function ensurePreviewQaQuoteFixture(tenantId: string): Promise<EnsurePreviewQaQuoteResult> {
  return withLock(async () => {
    if (!isSeedAllowed()) {
      return { status: "disabled" };
    }
    const db = await readDatabase();
    const quoteId = previewQaQuoteId(tenantId);
    const existing = db.quotes.find(
      (row) => row.id === quoteId && belongsToTenant(row, tenantId),
    );
    if (existing) {
      return { status: "exists", quote: normalizeStoredQuote(existing) };
    }

    const machines = filterByTenant(db.machines, tenantId);
    const machine =
      machines.find((row) => row.id === FIXTURE_MACHINE_IDS.hardware) ??
      machines.find((row) => row.id === FIXTURE_MACHINE_IDS.palletizer) ??
      machines.find((row) => row.parts.length > 0);
    if (!machine) {
      return { status: "no_machine" };
    }

    const customer =
      db.users.find(
        (user) =>
          user.id === SEED_CUSTOMER.id &&
          user.role === "customer" &&
          !user.deletedAt &&
          belongsToTenant(user, tenantId),
      ) ??
      db.users.find(
        (user) =>
          user.role === "customer" && !user.deletedAt && belongsToTenant(user, tenantId),
      );
    if (!customer) {
      return { status: "no_customer" };
    }

    const part = machine.parts[0];
    if (!part) {
      return { status: "no_machine" };
    }

    const staff =
      db.users.find(
        (user) =>
          user.id === SEED_STAFF.id &&
          user.role === "staff" &&
          !user.deletedAt &&
          belongsToTenant(user, tenantId),
      ) ??
      db.users.find(
        (user) =>
          user.role === "staff" && !user.deletedAt && belongsToTenant(user, tenantId),
      );

    const now = new Date().toISOString();
    const items: QuoteItem[] = [
      {
        id: part.id,
        qty: 1,
        name: part.name,
        ...(part.vendor ? { vendor: part.vendor } : {}),
        ...(part.material ? { material: part.material } : {}),
        ...(part.replaces ? { replaces: part.replaces } : {}),
        ...(part.stock ? { stock: part.stock } : {}),
        ...(part.category ? { category: part.category } : {}),
      },
    ];
    const activities: QuoteActivity[] = [
      newActivity(
        { email: customer.email, role: "customer" },
        "status",
        statusActivityText("requested"),
        now,
      ),
      newActivity(
        { email: customer.email, role: "customer" },
        "message",
        PREVIEW_QA_QUOTE_NOTE,
        now,
      ),
    ];
    if (staff) {
      activities.push(
        newActivity(
          { email: staff.email, role: "staff" },
          "message",
          "Preview QA reply — use this thread to exercise ConversationSheet.",
          now,
        ),
      );
    }

    const quote: QuoteRecord = {
      id: quoteId,
      number: nextQuoteNumber(db.quotes),
      machineId: machine.id,
      items,
      note: PREVIEW_QA_QUOTE_NOTE,
      createdAt: now,
      customerEmail: customer.email,
      customerId: customer.id,
      tenantId,
      status: "requested",
      shipments: [],
      activities,
      lastReadAt: { [customer.id]: now },
    };

    await writeDatabase({ ...db, quotes: [...db.quotes, quote] });
    return { status: "created", quote };
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
    return findQuoteInList(filterByTenant(db.quotes, tenantId), idOrNumber);
  });
}

export function mutateQuote(
  idOrNumber: string,
  tenantId: string,
  fn: (quote: QuoteRecord) => QuoteRecord,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const current = findQuoteInList(filterByTenant(db.quotes, tenantId), idOrNumber);
    if (!current) {
      return null;
    }
    const next = fn(current);
    await writeDatabase({
      ...db,
      quotes: db.quotes.map((quote) => (quote.id === current.id ? next : quote)),
    });
    if (conversationWatchChanged(current, next)) {
      await bumpChatWatch(chatWatchChannel("quote", next.id));
    }
    return next;
  });
}

export function appendQuoteActivity(
  idOrNumber: string,
  tenantId: string,
  actor: { email: string; role: ActivityActorRole; id: string },
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
  return mutateQuote(idOrNumber, tenantId, (quote) => ({
    ...quote,
    lastReadAt: { ...quote.lastReadAt, [userId]: readWatermarkNow(quote.activities) },
  }));
}

export { newActivity as createQuoteActivity };

function newTicketActivity(
  actor: { email: string; role: ActivityActorRole },
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
    if (manualFileNameClaimed(careCollections(db).manuals, input.storedFileName)) {
      return { error: "file-taken" as const };
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

export function chatAttachmentKeyClaimed(
  r2Key: string,
  except?: { quoteId?: string; ticketId?: string },
) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return chatKeyClaimed(db.quotes ?? [], careCollections(db).tickets, r2Key, except);
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
    return findTicketInList(
      filterByTenant(careCollections(db).tickets, tenantId),
      idOrNumber,
    );
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
    actor: { email: string; role: ActivityActorRole; id: string };
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
    const current = findTicketInList(
      filterByTenant(careCollections(db).tickets, tenantId),
      idOrNumber,
    );
    if (!current) {
      return null;
    }
    const next = fn(current);
    const tickets = careCollections(db).tickets.map((ticket) =>
      ticket.id === current.id ? next : ticket,
    );
    await writeDatabase({ ...db, ...careCollections(db), tickets });
    if (conversationWatchChanged(current, next)) {
      await bumpChatWatch(chatWatchChannel("ticket", next.id));
    }
    return next;
  });
}

export function updateTicketStatus(
  idOrNumber: string,
  tenantId: string,
  status: TicketStatus,
  actor: { email: string; role: ActivityActorRole; id: string },
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
  actor: { email: string; role: ActivityActorRole; id: string },
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
  return mutateTicket(idOrNumber, tenantId, (ticket) => ({
    ...ticket,
    lastReadAt: { ...ticket.lastReadAt, [userId]: readWatermarkNow(ticket.activities) },
  }));
}

export function setTicketAssistantPaused(
  idOrNumber: string,
  tenantId: string,
  paused: boolean,
) {
  const now = new Date().toISOString();
  return mutateTicket(idOrNumber, tenantId, (ticket) => ({
    ...ticket,
    assistantPaused: paused || undefined,
    assistantEscalatedAt: paused ? now : undefined,
  }));
}

export function setQuoteAssistantPaused(
  idOrNumber: string,
  tenantId: string,
  paused: boolean,
) {
  const now = new Date().toISOString();
  return mutateQuote(idOrNumber, tenantId, (quote) => ({
    ...quote,
    assistantPaused: paused || undefined,
    assistantEscalatedAt: paused ? now : undefined,
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
      snapshot: { ...nextValues },
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

export function listAccessInquiries() {
  return withLock(async () => {
    const db = await readDatabase();
    return [...(db.accessInquiries ?? [])].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  });
}

export function countNewAccessInquiries() {
  return withLock(async () => {
    const db = await readDatabase();
    return (db.accessInquiries ?? []).filter((row) => row.status === "new").length;
  });
}

export function getAccessInquiry(id: string) {
  return withLock(async () => {
    const db = await readDatabase();
    return (db.accessInquiries ?? []).find((row) => row.id === id) ?? null;
  });
}

export function createAccessInquiry(
  input: Omit<StoredAccessInquiry, "id" | "createdAt" | "updatedAt" | "status">,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const now = new Date().toISOString();
    const inquiry: StoredAccessInquiry = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: "new",
      ...input,
    };
    await writeDatabase({
      ...db,
      accessInquiries: [inquiry, ...(db.accessInquiries ?? [])],
    });
    return inquiry;
  });
}

export function updateAccessInquiryStatus(id: string, status: StoredAccessInquiry["status"]) {
  return withLock(async () => {
    const db = await readDatabase();
    const list = db.accessInquiries ?? [];
    const index = list.findIndex((row) => row.id === id);
    if (index === -1) {
      return null;
    }
    const next: StoredAccessInquiry = {
      ...list[index]!,
      status,
      updatedAt: new Date().toISOString(),
    };
    const accessInquiries = [...list];
    accessInquiries[index] = next;
    await writeDatabase({ ...db, accessInquiries });
    return next;
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
