import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLifecycleUpsert,
  buildTenantPartCatalog,
  enrichPartsWithLifecycle,
  healDemoPartLifecycle,
  lifecycleMapForQuotePartIds,
  parsePartLifecycleBulk,
  publicLifecycle,
} from "./part-lifecycle.ts";
import type { StoredMachine } from "./store.ts";

describe("part lifecycle catalog", () => {
  it("unions part numbers across machines for a tenant", () => {
    const machines: StoredMachine[] = [
      {
        id: "m1",
        name: "Line A",
        storedFileName: "a.glb",
        originalFileName: "a.glb",
        parts: [
          { id: "PN-1", name: "Pump", meshName: "p1", qty: 1 },
          { id: "PN-2", name: "Seal", meshName: "s1", qty: 2 },
        ],
        unmatched: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        tenantId: "tenant-a",
      },
      {
        id: "m2",
        name: "Line B",
        storedFileName: "b.glb",
        originalFileName: "b.glb",
        parts: [{ id: "PN-1", name: "Pump assembly", meshName: "p1b", qty: 1 }],
        unmatched: [{ source: "list", id: "PN-3", name: "Filter", qty: 1 }],
        createdAt: "2026-01-01T00:00:00.000Z",
        tenantId: "tenant-a",
      },
    ];
    const rows = buildTenantPartCatalog(machines, [], "tenant-a");
    assert.equal(rows.length, 3);
    const pump = rows.find((row) => row.partNumber === "PN-1");
    assert.ok(pump);
    assert.equal(pump.machineIds.length, 2);
    assert.equal(pump.lifecycle.status, "unknown");
  });

  it("maps lifecycle rows only for quote line part ids in tenant", () => {
    const rows = [
      {
        id: "tenant-a::PN-1",
        tenantId: "tenant-a",
        partNumber: "PN-1",
        status: "obsolete" as const,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "tenant-a::PN-2",
        tenantId: "tenant-a",
        partNumber: "PN-2",
        status: "active" as const,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "tenant-b::PN-1",
        tenantId: "tenant-b",
        partNumber: "PN-1",
        status: "announced" as const,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const map = lifecycleMapForQuotePartIds(rows, "tenant-a", ["PN-1", "PN-99"]);
    assert.equal(map.size, 1);
    assert.equal(map.get("PN-1")?.status, "obsolete");
    assert.equal(map.get("PN-2"), undefined);
  });

  it("enriches customer parts with status always; public slice only for announced/obsolete", () => {
    const rows = [
      {
        id: "tenant-a::PN-1",
        tenantId: "tenant-a",
        partNumber: "PN-1",
        status: "obsolete" as const,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "tenant-a::PN-2",
        tenantId: "tenant-a",
        partNumber: "PN-2",
        status: "active" as const,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const map = new Map(rows.map((row) => [row.partNumber, row]));
    const enriched = enrichPartsWithLifecycle(
      [
        { id: "PN-1", name: "A", meshName: "a", qty: 1 },
        { id: "PN-2", name: "B", meshName: "b", qty: 1 },
      ],
      map,
      "customer",
    );
    assert.equal(enriched[0]?.lifecycle?.status, "obsolete");
    assert.equal(enriched[1]?.lifecycle?.status, "active");
    assert.deepEqual(publicLifecycle({ status: "active" }), undefined);
  });

  it("upserts lifecycle rows by tenant and part number", () => {
    const next = applyLifecycleUpsert({
      rows: [],
      tenantId: "tenant-a",
      partNumber: "PN-9",
      patch: { status: "announced", sourceNotes: "NRND" },
      actorEmail: "staff@test",
      at: "2026-02-01T00:00:00.000Z",
    });
    assert.equal(next.length, 1);
    assert.equal(next[0]?.status, "announced");
    const merged = applyLifecycleUpsert({
      rows: next,
      tenantId: "tenant-a",
      partNumber: "PN-9",
      patch: { status: "obsolete" },
      actorEmail: "staff@test",
      at: "2026-03-01T00:00:00.000Z",
    });
    assert.equal(merged[0]?.status, "obsolete");
    assert.equal(merged[0]?.sourceNotes, "NRND");
  });
});

describe("healDemoPartLifecycle", () => {
  it("does not duplicate demo part numbers", () => {
    const db = {
      users: [],
      machines: [],
      quotes: [],
      bugReports: [],
      sites: [],
      partLifecycle: [
        {
          id: "tenant-oee360-host::6331K32",
          tenantId: "tenant-oee360-host",
          partNumber: "6331K32",
          status: "obsolete" as const,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const healed = healDemoPartLifecycle(db);
    const numbers = (healed.partLifecycle ?? []).map((row) => row.partNumber);
    assert.equal(numbers.filter((n) => n === "6331K32").length, 1);
  });
});

describe("parsePartLifecycleBulk", () => {
  it("accepts flat status fields on each update row", () => {
    const parsed = parsePartLifecycleBulk({
      updates: [
        { partNumber: "PN-1", status: "active" },
        { partNumber: "PN-2", status: "obsolete" },
      ],
    });
    assert.ok(!("error" in parsed));
    assert.equal(parsed.updates.length, 2);
    assert.equal(parsed.updates[0]?.patch.status, "active");
  });
});
