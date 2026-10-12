import {
  missingDemoLifecycleRows,
  normalizePartNumber,
  type StoredPartLifecycle,
} from "./part-lifecycle.ts";
import {
  appendMissingDemoStageQuotes,
  preferredDemoStageMachineId,
} from "./demo-stage-quote-seed.ts";
import { isSeedAllowed } from "./production-env.ts";
import { FIXTURE_MACHINE_IDS, buildFixtureMachineById } from "./seed-fixtures.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
import { nextQuoteNumber } from "./quotes.ts";
import type { QuoteRecord } from "../types/index.ts";
import type { Part, UnmatchedPart } from "../types/index.ts";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Recorded in catalog `dataMigrations` once v1 has completed successfully. */
export const DEMO_TENANT_DATA_MIGRATION_V1 = 1;

/** B1: shared bearing PN on hardware fixture + palletizer for multi-machine demo. */
export const DEMO_TENANT_DATA_MIGRATION_B1 = 1;

/** B2: stage-gated demo quotes on hardware fixture (PO received → shipped). */
export const DEMO_TENANT_DATA_MIGRATION_B2 = 1;

/** List-sourced bearing already on the hardware fixture; duplicated on palletizer via migration only. */
export const DEMO_MULTI_MACHINE_BEARING_PART_NUMBER = "5972K325";

const DEMO_MULTI_MACHINE_BEARING_UNMATCHED: UnmatchedPart = {
  source: "list",
  id: DEMO_MULTI_MACHINE_BEARING_PART_NUMBER,
  name: "Shielded ball bearing, 8 mm ID x 22 mm OD x 7 mm W",
  qty: 1,
};

/** Env var for optional demo-buyer creation outside this migration (never read here). */
export const SPARES_DEMO_BUYER_PASSWORD_ENV = "SPARES_DEMO_BUYER_PASSWORD";

export function readDemoBuyerPasswordFromEnv(): string | undefined {
  const value = process.env[SPARES_DEMO_BUYER_PASSWORD_ENV]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export const DEMO_TENANT_BUYER = {
  email: "user@demo.com",
  name: "Demo buyer",
} as const;

export const DEMO_TENANT_STAFF = {
  email: "staff@demo.com",
  name: "Demo staff",
} as const;

export const DEMO_TENANT_STAFF_B = {
  email: "staff-b@demo.com",
  name: "Staff B",
} as const;

export const DEMO_TENANT_DATA_MIGRATION_STAFF_B = 1;

export type DataMigrations = {
  demoTenantV1?: number;
  demoTenantB1?: number;
  demoTenantB2?: number;
  demoTenantStaffB?: number;
  /** When set, catalog heal runs in memory on read; use scripts/run-catalog-heal-once.mjs to persist. */
  catalogHealDeferredV1?: number;
  /** Hot rows (quotes/tickets/lifecycle) also CAS-write per-record JSON shards. */
  entityShardsV1?: number;
  /** Reset demo quote #26 stuck at PO received with junk tracking (prod heal). */
  demoQuote26HealV1?: number;
};

export const DEMO_QUOTE_26_HEAL_V1 = 1;

type DemoMigrationUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: "customer" | "staff";
  tenantId?: string;
  siteIds?: string[];
  machineIds?: string[];
  name?: string;
  deletedAt?: string;
  sessionStamp?: number;
};

type DemoMigrationMachine = {
  id: string;
  tenantId?: string;
  storedFileName: string;
  name?: string;
  parts?: Part[];
  unmatched?: UnmatchedPart[];
};

type DemoMigrationDb = {
  dataMigrations?: DataMigrations;
  users: DemoMigrationUser[];
  machines: DemoMigrationMachine[];
  partLifecycle?: StoredPartLifecycle[];
  quotes?: QuoteRecord[];
};

export type DemoTenantV1ApplyResult = {
  machineId: string;
  machineCreated: boolean;
  lifecycleAdded: string[];
  buyerGranted: boolean;
  buyerCreated: boolean;
};

let warnedMissingBuyer = false;

function migrationMarker(db: DemoMigrationDb) {
  return db.dataMigrations?.demoTenantV1 === DEMO_TENANT_DATA_MIGRATION_V1;
}

function b1MigrationMarker(db: DemoMigrationDb) {
  return db.dataMigrations?.demoTenantB1 === DEMO_TENANT_DATA_MIGRATION_B1;
}

function b2MigrationMarker(db: DemoMigrationDb) {
  return db.dataMigrations?.demoTenantB2 === DEMO_TENANT_DATA_MIGRATION_B2;
}

function withB2Marker<T extends DemoMigrationDb>(db: T): T {
  return {
    ...db,
    dataMigrations: {
      ...db.dataMigrations,
      demoTenantB2: DEMO_TENANT_DATA_MIGRATION_B2,
    },
  };
}

function withMarker<T extends DemoMigrationDb>(db: T): T {
  return {
    ...db,
    dataMigrations: {
      ...db.dataMigrations,
      demoTenantV1: DEMO_TENANT_DATA_MIGRATION_V1,
    },
  };
}

function withB1Marker<T extends DemoMigrationDb>(db: T): T {
  return {
    ...db,
    dataMigrations: {
      ...db.dataMigrations,
      demoTenantB1: DEMO_TENANT_DATA_MIGRATION_B1,
    },
  };
}

function machineListsPartNumber(machine: DemoMigrationMachine, partNumber: string) {
  const target = normalizePartNumber(partNumber);
  for (const part of machine.parts ?? []) {
    if (normalizePartNumber(part.id) === target) {
      return true;
    }
  }
  for (const row of machine.unmatched ?? []) {
    if (row.id && normalizePartNumber(row.id) === target) {
      return true;
    }
  }
  return false;
}

/**
 * Idempotent B1 demo content: place the hardware-fixture bearing on palletizer too so staff
 * catalog rows show two machines for one PN. Never removes or edits existing BOM lines.
 */
export function applyDemoTenantB1Migration<T extends DemoMigrationDb>(
  db: T,
): { db: T; changed: boolean; bearingAddedOnPalletizer: boolean } {
  const palletizerId = FIXTURE_MACHINE_IDS.palletizer;
  const index = db.machines.findIndex(
    (machine) =>
      machine.id === palletizerId &&
      (machine.tenantId === undefined || machine.tenantId === DEFAULT_TENANT_ID),
  );
  if (index < 0) {
    if (b1MigrationMarker(db)) {
      return { db, changed: false, bearingAddedOnPalletizer: false };
    }
    return {
      db: withB1Marker(db) as T,
      changed: true,
      bearingAddedOnPalletizer: false,
    };
  }
  const palletizer = db.machines[index];
  if (machineListsPartNumber(palletizer, DEMO_MULTI_MACHINE_BEARING_PART_NUMBER)) {
    if (b1MigrationMarker(db)) {
      return { db, changed: false, bearingAddedOnPalletizer: false };
    }
    return {
      db: withB1Marker(db) as T,
      changed: true,
      bearingAddedOnPalletizer: false,
    };
  }
  const unmatched = [...(palletizer.unmatched ?? []), DEMO_MULTI_MACHINE_BEARING_UNMATCHED];
  const machines = db.machines.slice();
  machines[index] = { ...palletizer, unmatched };
  return {
    db: withB1Marker({ ...db, machines }) as T,
    changed: true,
    bearingAddedOnPalletizer: true,
  };
}

function grantHardwareFixture(user: DemoMigrationUser, machineId: string): DemoMigrationUser {
  const machineIds = new Set(user.machineIds ?? []);
  if (machineIds.has(machineId)) {
    return user;
  }
  machineIds.add(machineId);
  return { ...user, machineIds: [...machineIds] };
}

/**
 * Idempotent demo-tenant content for Production (`SPARES_ALLOW_SEED` off): hardware fixture,
 * lifecycle rows, and an existing `user@demo.com` hardware-fixture grant (never creates users
 * or touches passwords).
 *
 * The v1 marker only records that the migration once ran. It never gates the work: every call
 * checks the real state and applies only the pieces that are missing, because a concurrent or
 * stale catalog write can lose any of them while the marker survives.
 */
/**
 * Idempotent B2: four stable pipeline-stage quotes on the hardware fixture for demo-tenant
 * verification (#367). Production demo host only (`SPARES_ALLOW_SEED` off).
 */
export function applyDemoTenantB2StageQuotesMigration<T extends DemoMigrationDb>(
  db: T,
): { db: T; changed: boolean; quotesAdded: number } {
  if (isSeedAllowed()) {
    return { db, changed: false, quotesAdded: 0 };
  }
  const tenantId = DEFAULT_TENANT_ID;
  const machineId = preferredDemoStageMachineId(
    db.machines.map((machine) => ({
      id: machine.id,
      parts: machine.parts ?? [],
    })),
  );
  if (!machineId) {
    if (b2MigrationMarker(db)) {
      return { db, changed: false, quotesAdded: 0 };
    }
    return { db: withB2Marker(db) as T, changed: true, quotesAdded: 0 };
  }
  const buyerEmail = normalizeEmail(DEMO_TENANT_BUYER.email);
  const customer = db.users.find(
    (user) => normalizeEmail(user.email) === buyerEmail && !user.deletedAt,
  );
  if (!customer || customer.role !== "customer") {
    if (b2MigrationMarker(db)) {
      return { db, changed: false, quotesAdded: 0 };
    }
    return { db: withB2Marker(db) as T, changed: true, quotesAdded: 0 };
  }
  const staff =
    db.users.find(
      (user) => user.role === "staff" && !user.deletedAt && user.tenantId === tenantId,
    ) ?? db.users.find((user) => user.role === "staff" && !user.deletedAt);
  const staffEmail = staff?.email ?? "staff@demo.com";
  const quotes = db.quotes ?? [];
  const appended = appendMissingDemoStageQuotes(
    { quotes },
    {
      tenantId,
      machineId,
      customerId: customer.id,
      customerEmail: customer.email,
      staffEmail,
      nextQuoteNumber,
    },
  );
  const quotesAdded = appended.added;
  const nextQuotes = appended.db.quotes;
  const changed =
    quotesAdded > 0 ||
    nextQuotes.length !== quotes.length ||
    !b2MigrationMarker(db);
  if (!changed) {
    return { db, changed: false, quotesAdded: 0 };
  }
  return {
    db: withB2Marker({ ...db, quotes: nextQuotes }) as T,
    changed: true,
    quotesAdded,
  };
}

function staffBMarker(db: DemoMigrationDb) {
  return db.dataMigrations?.demoTenantStaffB === DEMO_TENANT_DATA_MIGRATION_STAFF_B;
}

function withStaffBMarker<T extends DemoMigrationDb>(db: T): T {
  return {
    ...db,
    dataMigrations: {
      ...db.dataMigrations,
      demoTenantStaffB: DEMO_TENANT_DATA_MIGRATION_STAFF_B,
    },
  };
}

/**
 * Production demo tenant only: ensure `staff-b@demo.com` exists with the same password
 * hash as `staff@demo.com` so two-user CAS gates can log in on oee360.com.
 */
export function applyDemoTenantStaffBMigration<T extends DemoMigrationDb>(
  db: T,
): { db: T; changed: boolean; staffBCreated: boolean } {
  if (isSeedAllowed()) {
    return { db, changed: false, staffBCreated: false };
  }
  const staffAEmail = normalizeEmail(DEMO_TENANT_STAFF.email);
  const staffBEmail = normalizeEmail(DEMO_TENANT_STAFF_B.email);
  const staffA = db.users.find(
    (user) => normalizeEmail(user.email) === staffAEmail && user.role === "staff" && !user.deletedAt,
  );
  const staffBIndex = db.users.findIndex(
    (user) => normalizeEmail(user.email) === staffBEmail && !user.deletedAt,
  );
  if (staffBIndex >= 0) {
    const existing = db.users[staffBIndex];
    let users = db.users;
    let healed = false;
    if (!existing.name?.trim()) {
      users = users.slice();
      users[staffBIndex] = { ...existing, name: DEMO_TENANT_STAFF_B.name };
      healed = true;
    }
    if (staffBMarker(db) && !healed) {
      return { db, changed: false, staffBCreated: false };
    }
    return {
      db: withStaffBMarker(healed ? { ...db, users } : db) as T,
      changed: true,
      staffBCreated: false,
    };
  }
  if (!staffA?.passwordHash) {
    if (staffBMarker(db)) {
      return { db, changed: false, staffBCreated: false };
    }
    return { db: withStaffBMarker(db) as T, changed: true, staffBCreated: false };
  }
  const staffB: DemoMigrationUser = {
    id: "demo-staff-b",
    email: DEMO_TENANT_STAFF_B.email,
    passwordHash: staffA.passwordHash,
    role: "staff",
    tenantId: DEFAULT_TENANT_ID,
    name: DEMO_TENANT_STAFF_B.name,
  };
  return {
    db: withStaffBMarker({ ...db, users: [...db.users, staffB] }) as T,
    changed: true,
    staffBCreated: true,
  };
}

export async function applyDemoTenantV1Migration<T extends DemoMigrationDb>(
  db: T,
  actorEmail: string,
  persistModel: (name: string, bytes: Uint8Array | Buffer) => Promise<void>,
): Promise<{ db: T; changed: boolean; result: DemoTenantV1ApplyResult | null }> {
  if (isSeedAllowed()) {
    return { db, changed: false, result: null };
  }
  const machineId = FIXTURE_MACHINE_IDS.hardware;
  let machines = db.machines;
  let machineNameHealed = false;
  machines = machines.map((machine) => {
    if (machine.id !== machineId || machine.name !== "Harware fixture") {
      return machine;
    }
    machineNameHealed = true;
    return { ...machine, name: "Hardware fixture" };
  });
  let machineCreated = false;
  if (!machines.some((machine) => machine.id === machineId)) {
    const built = await buildFixtureMachineById(machineId);
    if (!built) {
      throw new Error("Hardware fixture definition is missing");
    }
    await persistModel(built.machine.storedFileName, built.bytes);
    machines = [...machines, { ...built.machine, tenantId: DEFAULT_TENANT_ID }];
    machineCreated = true;
  }

  const additions = missingDemoLifecycleRows(
    db.partLifecycle,
    DEFAULT_TENANT_ID,
    new Date().toISOString(),
    actorEmail,
  );

  const buyerEmail = normalizeEmail(DEMO_TENANT_BUYER.email);
  let users = db.users;
  let buyerGranted = false;
  const existingIndex = users.findIndex(
    (user) => normalizeEmail(user.email) === buyerEmail && !user.deletedAt,
  );
  if (existingIndex >= 0) {
    const updated = grantHardwareFixture(users[existingIndex], machineId);
    if (updated !== users[existingIndex]) {
      users = users.slice();
      users[existingIndex] = updated;
      buyerGranted = true;
    }
  } else {
    if (!warnedMissingBuyer) {
      warnedMissingBuyer = true;
      console.warn(
        `[demo-tenant-v1] skipping demo buyer step: ${buyerEmail} is not in the catalog (no user created)`,
      );
    }
  }

  const staffEmail = normalizeEmail(DEMO_TENANT_STAFF.email);
  let staffNameHealed = false;
  users = users.map((user) => {
    if (normalizeEmail(user.email) !== staffEmail || user.deletedAt) {
      return user;
    }
    if (user.name?.trim()) {
      return user;
    }
    staffNameHealed = true;
    return { ...user, name: DEMO_TENANT_STAFF.name };
  });

  const changed =
    machineCreated ||
    machineNameHealed ||
    additions.length > 0 ||
    buyerGranted ||
    staffNameHealed;
  if (!changed) {
    if (migrationMarker(db)) {
      return { db, changed: false, result: null };
    }
    return {
      db: withMarker(db) as T,
      changed: true,
      result: {
        machineId,
        machineCreated: false,
        lifecycleAdded: [],
        buyerGranted: false,
        buyerCreated: false,
      },
    };
  }

  const next = withMarker({
    ...db,
    machines,
    users,
    partLifecycle: [...(db.partLifecycle ?? []), ...additions],
  });

  return {
    db: next,
    changed: true,
    result: {
      machineId,
      machineCreated,
      lifecycleAdded: additions.map((row) => row.partNumber),
      buyerGranted,
      buyerCreated: false,
    },
  };
}

/** One-shot: unstick demo quote #26 (PO received + orphan tracking blocks regression). */
export function applyDemoQuote26HealMigration<T extends DemoMigrationDb & { quotes?: QuoteRecord[] }>(
  db: T,
): { db: T; changed: boolean } {
  const marked = {
    ...db,
    dataMigrations: {
      ...db.dataMigrations,
      demoQuote26HealV1: DEMO_QUOTE_26_HEAL_V1,
    },
  } as T;
  if (db.dataMigrations?.demoQuote26HealV1 === DEMO_QUOTE_26_HEAL_V1) {
    return { db, changed: false };
  }
  const quotes = db.quotes ?? [];
  const index = quotes.findIndex((row) => row.number === 26);
  if (index < 0) {
    return { db: marked, changed: true };
  }
  const quote = quotes[index];
  const stuck =
    quote.status === "po_received" &&
    (quote.shipments.some((row) => row.trackingNumber.trim()) ||
      quote.items.some((item) => typeof item.sellPrice === "number"));
  if (!stuck) {
    return { db: marked, changed: true };
  }
  const healedItems = quote.items.map((item) => ({
    id: item.id,
    qty: 1,
    ...(item.name ? { name: item.name } : {}),
  }));
  const { invoiceNumber: _dropInvoice, ...rest } = quote;
  const healed: QuoteRecord = {
    ...rest,
    status: "requested",
    items: healedItems,
    shipments: [],
    staffPricingUnlocked: false,
  };
  const nextQuotes = quotes.slice();
  nextQuotes[index] = healed;
  return {
    db: { ...marked, quotes: nextQuotes },
    changed: true,
  };
}

