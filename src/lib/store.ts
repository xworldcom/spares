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
  missingFixtureMachines,
  restoreMissingFixtureFiles,
} from "./seed-fixtures.ts";
import { toPublicUser } from "./access.ts";
import {
  nextTicketNumber,
  statusTicketText,
  usageHistoryEntry,
  usageSummary,
} from "./care.ts";
import { deleteManualFile, writeManualFile } from "./manual-storage.ts";
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

export const SEED_SITES: Site[] = [
  { id: "site-cargill-ftw", company: "Cargill", name: "Fort Worth" },
  { id: "site-cargill-wichita", company: "Cargill", name: "Wichita" },
  { id: "site-acme-dayton", company: "Acme", name: "Dayton" },
  { id: "site-demo-plant1", company: "Demo", name: "Plant 1" },
];

const SEED_USER_SITES: Record<string, string[]> = {
  "user-customer": ["site-cargill-ftw"],
  "user-acme": ["site-acme-dayton"],
  "user-mill": ["site-demo-plant1"],
};

const SEED_USER_COMPANIES: Record<string, string[]> = {
  "user-cargill-corp": ["Cargill"],
};

const SEED_MACHINE_SITES: Record<string, string> = {
  palletizer: "site-cargill-ftw",
  "hardware-fixture": "site-acme-dayton",
};

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  siteIds?: string[];
  companyAccess?: string[];
  machineIds?: string[];
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
  logText: string;
  screenshotFileName: string;
  githubIssueUrl?: string;
  delivery: "github" | "store";
};

export type StoredManual = MachineManual;
export type StoredTicket = ServiceTicketRecord;
export type StoredUsage = MachineUsage;

type Database = {
  users: StoredUser[];
  machines: StoredMachine[];
  quotes: StoredQuote[];
  bugReports: StoredBugReport[];
  sites: Site[];
  machineViews?: MachineView[];
  manuals?: StoredManual[];
  tickets?: StoredTicket[];
  machineUsage?: StoredUsage[];
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
    tickets: unionById(...stores.map((store) => store.tickets)),
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

async function seedDatabase(): Promise<Database> {
  const users: StoredUser[] = [
    await seedUser(SEED_STAFF),
    await seedUser(SEED_CUSTOMER),
    ...(await Promise.all(EXTRA_SEED_CUSTOMERS.map((row) => seedUser(row)))),
  ];
  return {
    users,
    machines: [],
    quotes: [],
    bugReports: [],
    sites: [...SEED_SITES],
    manuals: [],
    tickets: [],
    machineUsage: [],
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

function ensureSites(db: Database): Database {
  const have = new Map((db.sites ?? []).map((site) => [site.id, site]));
  for (const site of SEED_SITES) {
    if (!have.has(site.id)) {
      have.set(site.id, site);
    }
  }
  const sites = [...have.values()].sort((a, b) =>
    `${a.company} ${a.name}`.localeCompare(`${b.company} ${b.name}`),
  );
  const users = db.users.map((user) => {
    if (user.role !== "customer") {
      return user;
    }
    const hasPlant =
      (user.siteIds && user.siteIds.length > 0) ||
      (user.companyAccess && user.companyAccess.length > 0);
    if (hasPlant) {
      return user;
    }
    const company = SEED_USER_COMPANIES[user.id];
    if (company) {
      return { ...user, companyAccess: company, siteIds: [] };
    }
    const seeded = SEED_USER_SITES[user.id];
    return seeded ? { ...user, siteIds: seeded } : user;
  });
  const machines = db.machines.map((machine) => {
    if (machine.siteId) {
      return machine;
    }
    const seeded = SEED_MACHINE_SITES[machine.id];
    return seeded ? { ...machine, siteId: seeded } : machine;
  });
  return { ...db, sites, users, machines };
}

async function withFixtureMachines(db: Database): Promise<Database> {
  const extras = await missingFixtureMachines(db.machines, persistFile);
  if (extras.length === 0) {
    return db;
  }
  return { ...db, machines: [...db.machines, ...extras] };
}

function catalogChanged(before: Database, after: Database) {
  return (
    after.machines.length !== before.machines.length ||
    after.users.length !== before.users.length ||
    (after.sites?.length ?? 0) !== (before.sites?.length ?? 0) ||
    after.users.some((user, index) => user.id !== before.users[index]?.id)
  );
}

/**
 * Always re-run fixture + seed-user heal. A warm in-memory db with users but
 * empty machines must not stick around. Remote backends re-read every time.
 */
async function ensureCatalog(options?: { restoreFiles?: boolean }): Promise<Database> {
  const db = await readDatabase();
  const next = ensureSites(
    await withFixtureMachines(
      await ensureExtraCustomers(stabilizeSeedUsers(db)),
    ),
  );
  if (options?.restoreFiles) {
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
        users: parsed.users ?? [],
        machines: parsed.machines ?? [],
        quotes: rawQuotes.map((quote) => normalizeStoredQuote(quote)),
        bugReports: parsed.bugReports ?? [],
        sites: parsed.sites ?? [],
        machineViews: parsed.machineViews ?? [],
        manuals: parsed.manuals ?? [],
        tickets: parsed.tickets ?? [],
        machineUsage: parsed.machineUsage ?? [],
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
    const seeded = await overlayPersistedCare(
      await withFixtureMachines(await seedDatabase()),
    );
    await writeDatabase(seeded);
    return seeded;
  }

  const quotes = assignMissingQuoteNumbers(loaded.db.quotes);
  const next = await overlayPersistedCare(
    ensureSites(
      await withFixtureMachines(
        await ensureExtraCustomers(stabilizeSeedUsers({ ...loaded.db, quotes })),
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
    (next.sites?.length ?? 0) !== (loaded.db.sites?.length ?? 0)
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
  const normalized = applyCare(next, careCollections(next));
  memory = normalized;
  await Promise.all([
    getPersistence().writeDatabaseJson(JSON.stringify(normalized, null, 2)),
    writeCareStore(careCollections(normalized)),
  ]);
}

/** Catalog/seed heals rewrite db.json — never replace the Care sidecar. */
async function writeCatalogHeal(next: Database) {
  const kept = await overlayPersistedCare(next);
  memory = kept;
  await getPersistence().writeDatabaseJson(JSON.stringify(kept, null, 2));
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
    return db.users.find((user) => user.email === normalized) ?? null;
  });
}

export function listCustomers() {
  return withLock(async () => {
    const db = await ensureCatalog();
    return db.users
      .filter((user) => user.role === "customer")
      .map((user) => toPublicUser(user, db.sites ?? []))
      .sort((a, b) => a.email.localeCompare(b.email));
  });
}

export function createCustomer(
  email: string,
  passwordHash: string,
  access: { siteIds?: string[]; companyAccess?: string[] } = {},
) {
  const normalized = normalizeEmail(email);
  return withLock(async () => {
    const db = await readDatabase();
    if (db.users.some((user) => user.email === normalized)) {
      return { error: "email-taken" as const };
    }
    const known = new Set((db.sites ?? []).map((site) => site.id));
    const companies = new Set((db.sites ?? []).map((site) => site.company));
    const user: StoredUser = {
      id: randomUUID(),
      email: normalized,
      passwordHash,
      role: "customer",
      siteIds: (access.siteIds ?? []).filter((id) => known.has(id)),
      companyAccess: (access.companyAccess ?? []).filter((name) =>
        companies.has(name),
      ),
    };
    await writeDatabase({ ...db, users: [...db.users, user] });
    return { user };
  });
}

export function listSites() {
  return withLock(async () => {
    const db = await ensureCatalog();
    return [...(db.sites ?? [])];
  });
}

export function createSite(company: string, name: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const nextCompany = company.trim();
    const nextName = name.trim();
    if (!nextCompany || !nextName) {
      return { error: "invalid" as const };
    }
    const exists = (db.sites ?? []).some(
      (site) =>
        site.company.toLowerCase() === nextCompany.toLowerCase() &&
        site.name.toLowerCase() === nextName.toLowerCase(),
    );
    if (exists) {
      return { error: "taken" as const };
    }
    const site: Site = {
      id: `site-${randomUUID()}`,
      company: nextCompany,
      name: nextName,
    };
    const sites = [...(db.sites ?? []), site].sort((a, b) =>
      `${a.company} ${a.name}`.localeCompare(`${b.company} ${b.name}`),
    );
    await writeDatabase({ ...db, sites });
    return { site };
  });
}

export function updateCustomerSites(
  userId: string,
  access: {
    siteIds?: string[];
    companyAccess?: string[];
    machineIds?: string[];
  },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.users.findIndex((user) => user.id === userId);
    if (index < 0) {
      return { error: "not-found" as const };
    }
    const user = db.users[index];
    if (user.role !== "customer") {
      return { error: "not-customer" as const };
    }
    const known = new Set((db.sites ?? []).map((site) => site.id));
    const companies = new Set((db.sites ?? []).map((site) => site.company));
    const machineIds = new Set(db.machines.map((machine) => machine.id));
    const next = {
      ...user,
      siteIds: [...new Set((access.siteIds ?? []).filter((id) => known.has(id)))],
      companyAccess: [
        ...new Set(
          (access.companyAccess ?? []).filter((name) => companies.has(name)),
        ),
      ],
      machineIds: [
        ...new Set((access.machineIds ?? []).filter((id) => machineIds.has(id))),
      ],
    };
    const users = db.users.slice();
    users[index] = next;
    await writeDatabase({ ...db, users });
    return { user: next };
  });
}

export function updateMachine(
  machineId: string,
  patch: { name?: string; siteId?: string | null; part?: StaffPartEdit },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.machines.findIndex((machine) => machine.id === machineId);
    if (index < 0) {
      return { error: "not-found" as const };
    }
    if (patch.siteId !== undefined && patch.siteId) {
      if (!(db.sites ?? []).some((site) => site.id === patch.siteId)) {
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

export function updateMachineSite(machineId: string, siteId: string | null) {
  return updateMachine(machineId, { siteId });
}

export function deleteMachine(machineId: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.machines.findIndex((machine) => machine.id === machineId);
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

export function listMachines(options?: { heal?: boolean }) {
  return withLock(async () => {
    if (options?.heal) {
      memory = null;
    }
    const db = await ensureCatalog({ restoreFiles: options?.heal });
    return db.machines.map((machine) => ({
      id: machine.id,
      name: machine.name,
      siteId: machine.siteId,
      version: machine.version ?? 1,
    }));
  });
}

export function getMachine(id: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return db.machines.find((machine) => machine.id === id) ?? null;
  });
}

export function listMachineModelFiles() {
  return withLock(async () => {
    const db = await ensureCatalog();
    return db.machines.map((machine) => ({
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

export function createMachine(input: {
  name: string;
  storedFileName: string;
  originalFileName: string;
  parts: Part[];
  unmatched: UnmatchedPart[];
  siteId?: string;
}) {
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
      version: 1,
    };
    await writeDatabase({ ...db, machines: [...db.machines, machine] });
    return machine;
  });
}

export function replaceMachinePack(
  machineId: string,
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
    const index = db.machines.findIndex((machine) => machine.id === machineId);
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
}) {
  return withLock(async () => {
    const db = await readDatabase();
    const view: MachineView = {
      id: randomUUID(),
      at: new Date().toISOString(),
      userId: input.userId,
      email: input.email,
      machineId: input.machineId,
    };
    const machineViews = [view, ...(db.machineViews ?? [])].slice(0, 500);
    await writeDatabase({ ...db, machineViews });
    return view;
  });
}

export function listMachineViews(machineId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return (db.machineViews ?? []).filter((row) => row.machineId === machineId);
  });
}

export function bulkUpdateCustomerAccess(
  userIds: string[],
  access: { siteIds?: string[]; companyAccess?: string[] },
) {
  return withLock(async () => {
    const db = await readDatabase();
    const known = new Set((db.sites ?? []).map((site) => site.id));
    const companies = new Set((db.sites ?? []).map((site) => site.company));
    const wanted = new Set(userIds);
    const users = db.users.map((user) => {
      if (!wanted.has(user.id) || user.role !== "customer") {
        return user;
      }
      return {
        ...user,
        siteIds: [...new Set((access.siteIds ?? []).filter((id) => known.has(id)))],
        companyAccess: [
          ...new Set(
            (access.companyAccess ?? []).filter((name) => companies.has(name)),
          ),
        ],
      };
    });
    await writeDatabase({ ...db, users });
    return users.filter((user) => wanted.has(user.id) && user.role === "customer");
  });
}

function newActivity(
  actor: { email: string; role: Role },
  kind: QuoteActivity["kind"],
  text: string,
  at = new Date().toISOString(),
): QuoteActivity {
  return {
    id: randomUUID(),
    at,
    actorRole: actor.role,
    actorEmail: actor.email,
    kind,
    text,
  };
}

export function createQuote(input: {
  machineId: string;
  items: QuoteItem[];
  note?: string;
  customerId: string;
  customerEmail: string;
}) {
  return withLock(async () => {
    const db = await readDatabase();
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
      status: "requested",
      shipments: [],
      activities: [activity],
      lastReadAt: { [input.customerId]: now },
    };
    await writeDatabase({ ...db, quotes: [...db.quotes, quote] });
    return quote;
  });
}

export function listQuotes() {
  return withLock(async () => {
    const db = await readDatabase();
    return [...db.quotes]
      .map((quote) => normalizeStoredQuote(quote))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export function getQuote(idOrNumber: string) {
  return withLock(async () => {
    const db = await readDatabase();
    return findQuoteInList(db.quotes, idOrNumber);
  });
}

export function mutateQuote(
  idOrNumber: string,
  fn: (quote: QuoteRecord) => QuoteRecord,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const current = findQuoteInList(db.quotes, idOrNumber);
    if (!current) {
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
  actor: { email: string; role: Role; id: string },
  kind: QuoteActivity["kind"],
  text: string,
) {
  return mutateQuote(idOrNumber, (quote) => {
    const activity = newActivity(actor, kind, text);
    return {
      ...quote,
      activities: [...quote.activities, activity],
      lastReadAt: { ...quote.lastReadAt, [actor.id]: activity.at },
    };
  });
}

export function markQuoteRead(idOrNumber: string, userId: string) {
  const now = new Date().toISOString();
  return mutateQuote(idOrNumber, (quote) => ({
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
): TicketActivity {
  return {
    id: randomUUID(),
    at,
    actorRole: actor.role,
    actorEmail: actor.email,
    kind,
    text,
  };
}

export function listManuals(machineId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return careCollections(db)
      .manuals.filter((manual) => manual.machineId === machineId)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  });
}

export function getManual(machineId: string, manualId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return (
      careCollections(db).manuals.find(
        (manual) => manual.machineId === machineId && manual.id === manualId,
      ) ?? null
    );
  });
}

export function createManual(input: {
  machineId: string;
  title: string;
  category: ManualCategory;
  storedFileName: string;
  originalFileName: string;
  contentType: string;
  sizeBytes?: number;
  uploadedByEmail: string;
  bytes?: Buffer;
}) {
  return withLock(async () => {
    const db = await readDatabase();
    if (!db.machines.some((machine) => machine.id === input.machineId)) {
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
    };
    const manuals = [manual, ...careCollections(db).manuals];
    await writeDatabase({ ...db, ...careCollections(db), manuals });
    return { manual };
  });
}

export function listTickets(machineId?: string) {
  return withLock(async () => {
    const db = await readDatabase();
    const tickets = careCollections(db).tickets.filter((ticket) =>
      machineId ? ticket.machineId === machineId : true,
    );
    return tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export function getTicket(idOrNumber: string) {
  return withLock(async () => {
    const db = await readDatabase();
    return findTicketInList(careCollections(db).tickets, idOrNumber);
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

export function createTicket(input: {
  machineId: string;
  title: string;
  customerId: string;
  customerEmail: string;
  actor: { email: string; role: Role; id: string };
  note?: string;
}) {
  return withLock(async () => {
    const db = await readDatabase();
    if (!db.machines.some((machine) => machine.id === input.machineId)) {
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
  fn: (ticket: StoredTicket) => StoredTicket,
) {
  return withLock(async () => {
    const db = await readDatabase();
    const current = findTicketInList(careCollections(db).tickets, idOrNumber);
    if (!current) {
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
  status: TicketStatus,
  actor: { email: string; role: Role; id: string },
) {
  return mutateTicket(idOrNumber, (ticket) => {
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
  actor: { email: string; role: Role; id: string },
  text: string,
) {
  return mutateTicket(idOrNumber, (ticket) => {
    const activity = newTicketActivity(actor, "message", text);
    return {
      ...ticket,
      activities: [...ticket.activities, activity],
      lastReadAt: { ...ticket.lastReadAt, [actor.id]: activity.at },
    };
  });
}

export function markTicketRead(idOrNumber: string, userId: string) {
  const now = new Date().toISOString();
  return mutateTicket(idOrNumber, (ticket) => ({
    ...ticket,
    lastReadAt: { ...ticket.lastReadAt, [userId]: now },
  }));
}

export function getMachineUsage(machineId: string) {
  return withLock(async () => {
    const db = await ensureCatalog();
    return (
      careCollections(db).machineUsage.find((row) => row.machineId === machineId) ??
      null
    );
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
    if (!db.machines.some((machine) => machine.id === machineId)) {
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

export function listBugReports() {
  return withLock(async () => {
    const db = await readDatabase();
    return [...db.bugReports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export function getBugReport(id: string) {
  return withLock(async () => {
    const db = await readDatabase();
    return db.bugReports.find((report) => report.id === id) ?? null;
  });
}

export function createBugReport(input: {
  description: string;
  path: string;
  userAgent: string;
  userEmail?: string;
  userRole?: Role;
  logText: string;
  screenshot?: Buffer;
  githubIssueUrl?: string;
}) {
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
