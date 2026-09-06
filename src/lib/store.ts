import { randomUUID } from "node:crypto";
import { hashPassword } from "./auth/password.ts";
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
import type {
  MachineView,
  Part,
  QuoteActivity,
  QuoteItem,
  QuoteRecord,
  Role,
  Site,
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

type Database = {
  users: StoredUser[];
  machines: StoredMachine[];
  quotes: StoredQuote[];
  bugReports: StoredBugReport[];
  sites: Site[];
  machineViews?: MachineView[];
};

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

async function persistFile(storedFileName: string, bytes: Buffer) {
  await getPersistence().writeFileBytes(safeStoredFileName(storedFileName), bytes);
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
  return { users, machines: [], quotes: [], bugReports: [], sites: [...SEED_SITES] };
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
      async (name) => Boolean((await getPersistence().readFileBytes(name))?.length),
      persistFile,
    );
  }
  if (catalogChanged(db, next)) {
    await writeDatabase(next);
    return next;
  }
  memory = next;
  return next;
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
    const seeded = await withFixtureMachines(await seedDatabase());
    await writeDatabase(seeded);
    return seeded;
  }

  const quotes = assignMissingQuoteNumbers(loaded.db.quotes);
  const next = ensureSites(
    await withFixtureMachines(
      await ensureExtraCustomers(stabilizeSeedUsers({ ...loaded.db, quotes })),
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
    await writeDatabase(next);
    return next;
  }
  memory = next;
  return next;
}

async function writeDatabase(next: Database) {
  memory = next;
  await getPersistence().writeDatabaseJson(JSON.stringify(next, null, 2));
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

export function updateMachineSite(machineId: string, siteId: string | null) {
  return withLock(async () => {
    const db = await readDatabase();
    const index = db.machines.findIndex((machine) => machine.id === machineId);
    if (index < 0) {
      return { error: "not-found" as const };
    }
    if (siteId && !(db.sites ?? []).some((site) => site.id === siteId)) {
      return { error: "bad-site" as const };
    }
    const machines = db.machines.slice();
    const current = machines[index];
    machines[index] = siteId
      ? { ...current, siteId }
      : { ...current, siteId: undefined };
    await writeDatabase({ ...db, machines });
    return { machine: machines[index] };
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

/** Test helper: drop the in-process cache so the next read hits disk. */
export function resetStoreMemoryForTests() {
  memory = null;
}

/** Test helper: simulate a warm instance that has users but no machines. */
export function seedEmptyMachineCatalogForTests(users: StoredUser[]) {
  memory = { users, machines: [], quotes: [], bugReports: [], sites: [], machineViews: [] };
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
  const bytes = await getPersistence().readFileBytes(safeStoredFileName(storedFileName));
  if (!bytes?.length) {
    throw new Error("Stored file not found");
  }
  return bytes;
}

export function saveMachineFile(storedFileName: string, bytes: Buffer) {
  return withLock(async () => {
    await persistFile(storedFileName, bytes);
  });
}
