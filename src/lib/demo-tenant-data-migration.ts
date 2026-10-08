import {
  missingDemoLifecycleRows,
  type StoredPartLifecycle,
} from "./part-lifecycle.ts";
import { isSeedAllowed } from "./production-env.ts";
import { FIXTURE_MACHINE_IDS, buildFixtureMachineById } from "./seed-fixtures.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Recorded in catalog `dataMigrations` once v1 has completed successfully. */
export const DEMO_TENANT_DATA_MIGRATION_V1 = 1;

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

export type DataMigrations = {
  demoTenantV1?: number;
};

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

type DemoMigrationDb = {
  dataMigrations?: DataMigrations;
  users: DemoMigrationUser[];
  machines: Array<{ id: string; tenantId?: string; storedFileName: string }>;
  partLifecycle?: StoredPartLifecycle[];
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

function withMarker<T extends DemoMigrationDb>(db: T): T {
  return {
    ...db,
    dataMigrations: {
      ...db.dataMigrations,
      demoTenantV1: DEMO_TENANT_DATA_MIGRATION_V1,
    },
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

  const changed =
    machineCreated || additions.length > 0 || buyerGranted;
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
