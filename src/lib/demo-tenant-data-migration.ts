import { hashPassword } from "./auth/password.ts";
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

export const DEMO_TENANT_BUYER = {
  email: "user@demo.com",
  password: "Oee360Demo1!",
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
 * lifecycle rows, and `user@demo.com` machine grant. Skips when the v1 marker is already set.
 */
export async function applyDemoTenantV1Migration<T extends DemoMigrationDb>(
  db: T,
  actorEmail: string,
  persistModel: (name: string, bytes: Uint8Array | Buffer) => Promise<void>,
): Promise<{ db: T; changed: boolean; result: DemoTenantV1ApplyResult | null }> {
  if (isSeedAllowed()) {
    return { db, changed: false, result: null };
  }
  if (migrationMarker(db)) {
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
  let buyerCreated = false;
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
    const passwordHash = await hashPassword(DEMO_TENANT_BUYER.password);
    const user: DemoMigrationUser = {
      id: "demo-tenant-buyer-v1",
      email: buyerEmail,
      passwordHash,
      role: "customer",
      tenantId: DEFAULT_TENANT_ID,
      siteIds: [],
      machineIds: [machineId],
      name: DEMO_TENANT_BUYER.name,
    };
    users = [...users, user];
    buyerCreated = true;
    buyerGranted = true;
  }

  const changed =
    machineCreated || additions.length > 0 || buyerCreated || buyerGranted;
  if (!changed) {
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
      buyerCreated,
    },
  };
}
