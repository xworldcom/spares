import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { ticketIsOpen } from "./care.ts";
import { canAccessPlatformAdmin } from "./platform-admin.ts";
import {
  buildPlatformDeploymentRow,
  computeTenantSizeMetrics,
  computeTenantUsageMetrics,
} from "./platform-metrics.ts";
import { setPersistenceForTests } from "./persistence.ts";
import {
  createMachine,
  createTenant,
  createTenantWithOptionalStaff,
  listPlatformDeployments,
  resetStoreMemoryForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
import { hashPassword } from "./auth/password.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-platform-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("platform admin metrics", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
    delete process.env.SPARES_OWNER_EMAIL;
  });

  it("limits platform admin to configured owner emails", () => {
    process.env.SPARES_PLATFORM_OWNER_EMAILS = "owner@test,sibling@test";
    assert.equal(canAccessPlatformAdmin("owner@test"), true);
    assert.equal(canAccessPlatformAdmin("sibling@test"), true);
    assert.equal(canAccessPlatformAdmin("satellite-staff@test"), false);
  });

  it("scopes size metrics per tenantId", async () => {
    await isolated();
    const other = await createTenantWithOptionalStaff("Metrics Co B", {
      email: "b-staff@test",
      passwordHash: await hashPassword("pass"),
    });
    assert.ok("tenant" in other);

    await createMachine(DEFAULT_TENANT_ID, {
      name: "Host machine",
      storedFileName: "host.glb",
      originalFileName: "host.glb",
      parts: [],
      unmatched: [],
    });
    await createMachine(other.tenant.id, {
      name: "B machine",
      storedFileName: "b.glb",
      originalFileName: "b.glb",
      parts: [],
      unmatched: [],
    });

    const deployments = await listPlatformDeployments();
    const host = deployments.find((row) => row.tenant.id === DEFAULT_TENANT_ID);
    const satellite = deployments.find((row) => row.tenant.id === other.tenant.id);
    assert.ok(host);
    assert.ok(satellite);
    assert.equal(host.size.machines >= 1, true);
    assert.equal(satellite.size.machines, 1);
    assert.equal(satellite.size.staffUsers, 1);
    assert.equal(host.kind, "host");
    assert.equal(satellite.kind, "satellite");
  });

  it("computes usage window from catalog timestamps only", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    const recent = "2026-06-10T00:00:00.000Z";
    const old = "2025-01-01T00:00:00.000Z";
    const tenantId = "tenant-b";
    const usage = computeTenantUsageMetrics(
      tenantId,
      {
        users: [],
        machines: [
          { createdAt: recent, tenantId },
          { createdAt: old, tenantId },
        ],
        quotes: [{ id: "q1", createdAt: recent, tenantId, status: "requested" } as never],
        tickets: [
          {
            id: "t1",
            createdAt: old,
            tenantId,
            status: "open",
          } as never,
        ],
        machineUsage: [{ machineId: "m1", tenantId, updatedAt: recent, updatedByEmail: "a", history: [] }],
      },
      30,
      now,
    );
    assert.equal(usage.machinesCreated, 1);
    assert.equal(usage.quotesCreated, 1);
    assert.equal(usage.ticketsCreated, 0);
    assert.equal(usage.usageRowUpdates, 1);
    assert.match(usage.label, /catalog timestamps/);
  });

  it("does not count closed quotes as open", () => {
    const size = computeTenantSizeMetrics("tenant-x", {
      users: [],
      machines: [],
      quotes: [
        { id: "q-open", tenantId: "tenant-x", status: "quoted" } as never,
        { id: "q-closed", tenantId: "tenant-x", status: "closed" } as never,
      ],
    });
    assert.equal(size.openQuotes, 1);
    assert.equal(ticketIsOpen("resolved"), false);
  });

  it("buildPlatformDeploymentRow marks inactive tenants", () => {
    const row = buildPlatformDeploymentRow(
      {
        id: "tenant-x",
        name: "X",
        slug: "x",
        createdAt: "2020-01-01T00:00:00.000Z",
        inactiveAt: "2026-01-01T00:00:00.000Z",
      },
      { users: [], machines: [], quotes: [] },
    );
    assert.equal(row.inactive, true);
  });

  it("createTenant adds a deployment row without touching host counts", async () => {
    await isolated();
    const before = await listPlatformDeployments();
    const hostBefore = before.find((row) => row.tenant.id === DEFAULT_TENANT_ID);
    const created = await createTenant("Empty Satellite");
    assert.ok("tenant" in created);
    const after = await listPlatformDeployments();
    assert.equal(after.length, before.length + 1);
    const hostAfter = after.find((row) => row.tenant.id === DEFAULT_TENANT_ID);
    assert.equal(hostAfter?.size.machines, hostBefore?.size.machines);
  });
});
