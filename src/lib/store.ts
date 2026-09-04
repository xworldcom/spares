import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "@/lib/auth/password";
import {
  assignMissingQuoteNumbers,
  findQuoteInList,
  nextQuoteNumber,
  normalizeStoredQuote,
  statusActivityText,
} from "@/lib/quotes";
import { missingFixtureMachines } from "@/lib/seed-fixtures";
import type {
  Part,
  QuoteActivity,
  QuoteItem,
  QuoteRecord,
  Role,
  UnmatchedPart,
} from "@/types";

export const SEED_STAFF = {
  email: "staff@spares.local",
  password: "SparesStaff1!",
  role: "staff" as const,
};

export const SEED_CUSTOMER = {
  email: "customer@spares.local",
  password: "SparesCustomer1!",
  role: "customer" as const,
};

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
};

export type StoredMachine = {
  id: string;
  name: string;
  storedFileName: string;
  originalFileName: string;
  parts: Part[];
  unmatched: UnmatchedPart[];
  createdAt: string;
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
};

let queue: Promise<unknown> = Promise.resolve();
let memory: Database | null = null;

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function getDataDir() {
  if (process.env.SPARES_DATA_DIR) {
    return path.resolve(process.env.SPARES_DATA_DIR);
  }
  if (process.env.VERCEL) {
    return "/tmp/spares-data";
  }
  return path.join(process.cwd(), "data");
}

function dbPath() {
  return path.join(getDataDir(), "db.json");
}

export function filesDir() {
  return path.join(getDataDir(), "files");
}

async function ensureDirs() {
  await mkdir(filesDir(), { recursive: true });
}

async function seedDatabase(): Promise<Database> {
  const users: StoredUser[] = [
    {
      id: randomUUID(),
      email: SEED_STAFF.email,
      passwordHash: await hashPassword(SEED_STAFF.password),
      role: SEED_STAFF.role,
    },
    {
      id: randomUUID(),
      email: SEED_CUSTOMER.email,
      passwordHash: await hashPassword(SEED_CUSTOMER.password),
      role: SEED_CUSTOMER.role,
    },
  ];
  return { users, machines: [], quotes: [], bugReports: [] };
}

async function withFixtureMachines(db: Database): Promise<Database> {
  await ensureDirs();
  const extras = await missingFixtureMachines(db.machines, filesDir());
  if (extras.length === 0) {
    return db;
  }
  return { ...db, machines: [...db.machines, ...extras] };
}

async function readDatabase(): Promise<Database> {
  if (memory) {
    return memory;
  }

  await ensureDirs();
  try {
    const raw = await readFile(dbPath(), "utf8");
    const parsed = JSON.parse(raw) as Database;
    if (!parsed.users?.length) {
      memory = await withFixtureMachines(await seedDatabase());
      await writeFile(dbPath(), JSON.stringify(memory, null, 2));
      return memory;
    }
    const quotes = assignMissingQuoteNumbers(
      (parsed.quotes ?? []).map((quote) => normalizeStoredQuote(quote)),
    );
    const next = await withFixtureMachines({
      users: parsed.users ?? [],
      machines: parsed.machines ?? [],
      quotes,
      bugReports: parsed.bugReports ?? [],
    });
    const numbersAssigned = (parsed.quotes ?? []).some(
      (quote) => typeof quote.number !== "number" || quote.number < 1,
    );
    if (
      next.machines.length !== (parsed.machines ?? []).length ||
      numbersAssigned
    ) {
      await writeFile(dbPath(), JSON.stringify(next, null, 2));
    }
    memory = next;
    return memory;
  } catch {
    memory = await withFixtureMachines(await seedDatabase());
    await writeFile(dbPath(), JSON.stringify(memory, null, 2));
    return memory;
  }
}

async function writeDatabase(next: Database) {
  memory = next;
  await ensureDirs();
  await writeFile(dbPath(), JSON.stringify(next, null, 2));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function findUserById(id: string) {
  return withLock(async () => {
    const db = await readDatabase();
    return db.users.find((user) => user.id === id) ?? null;
  });
}

export function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  return withLock(async () => {
    const db = await readDatabase();
    return db.users.find((user) => user.email === normalized) ?? null;
  });
}

export function createCustomer(email: string, passwordHash: string) {
  const normalized = normalizeEmail(email);
  return withLock(async () => {
    const db = await readDatabase();
    if (db.users.some((user) => user.email === normalized)) {
      return { error: "email-taken" as const };
    }
    const user: StoredUser = {
      id: randomUUID(),
      email: normalized,
      passwordHash,
      role: "customer",
    };
    await writeDatabase({ ...db, users: [...db.users, user] });
    return { user };
  });
}

export function listMachines() {
  return withLock(async () => {
    const db = await readDatabase();
    return db.machines.map((machine) => ({ id: machine.id, name: machine.name }));
  });
}

export function getMachine(id: string) {
  return withLock(async () => {
    const db = await readDatabase();
    return db.machines.find((machine) => machine.id === id) ?? null;
  });
}

export function createMachine(input: {
  name: string;
  storedFileName: string;
  originalFileName: string;
  parts: Part[];
  unmatched: UnmatchedPart[];
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
    };
    await writeDatabase({ ...db, machines: [...db.machines, machine] });
    return machine;
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
      await ensureDirs();
      await writeFile(machineFilePath(screenshotFileName), input.screenshot);
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
  return path.join(filesDir(), storedFileName);
}

export function saveMachineFile(storedFileName: string, bytes: Buffer) {
  return withLock(async () => {
    await ensureDirs();
    await writeFile(machineFilePath(storedFileName), bytes);
  });
}
