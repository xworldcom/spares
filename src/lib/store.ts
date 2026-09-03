import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "@/lib/auth/password";
import type { Part, Quote, Role, UnmatchedPart } from "@/types";

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

export type StoredQuote = Quote & {
  customerId: string;
};

type Database = {
  users: StoredUser[];
  machines: StoredMachine[];
  quotes: StoredQuote[];
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
  return { users, machines: [], quotes: [] };
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
      memory = await seedDatabase();
      await writeFile(dbPath(), JSON.stringify(memory, null, 2));
      return memory;
    }
    memory = {
      users: parsed.users ?? [],
      machines: parsed.machines ?? [],
      quotes: parsed.quotes ?? [],
    };
    return memory;
  } catch {
    memory = await seedDatabase();
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

export function createQuote(input: {
  machineId: string;
  partIds: string[];
  note?: string;
  customerId: string;
  customerEmail: string;
}) {
  return withLock(async () => {
    const db = await readDatabase();
    const quote: StoredQuote = {
      id: randomUUID(),
      machineId: input.machineId,
      partIds: input.partIds,
      note: input.note,
      createdAt: new Date().toISOString(),
      customerEmail: input.customerEmail,
      customerId: input.customerId,
    };
    await writeDatabase({ ...db, quotes: [...db.quotes, quote] });
    return quote;
  });
}

export function listQuotes() {
  return withLock(async () => {
    const db = await readDatabase();
    return [...db.quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
