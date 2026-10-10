import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildObsoleteLifecycleNotifications,
  lifecycleNotificationDedupeKey,
  lifecycleObsoleteNotifyEnabled,
} from "./lifecycle-notifications.ts";
import type { StoredUser } from "./store.ts";

const staff: StoredUser = {
  id: "staff-1",
  email: "staff@host.test",
  passwordHash: "x",
  role: "staff",
  tenantId: "tenant-a",
};

const customer: StoredUser = {
  id: "cust-1",
  email: "buyer@test.com",
  passwordHash: "x",
  role: "customer",
  tenantId: "tenant-a",
  machineIds: ["m1"],
};

const customerOther: StoredUser = {
  id: "cust-2",
  email: "other@test.com",
  passwordHash: "x",
  role: "customer",
  tenantId: "tenant-a",
  machineIds: ["m2"],
};

describe("lifecycle notifications", () => {
  it("defaults obsolete notify to enabled", () => {
    assert.equal(lifecycleObsoleteNotifyEnabled({}), true);
    assert.equal(lifecycleObsoleteNotifyEnabled({ lifecycleNotifyObsolete: false }), false);
  });

  it("fans out to staff and machine-scoped customers only", () => {
    const at = "2026-10-10T12:00:00.000Z";
    const rows = buildObsoleteLifecycleNotifications({
      existing: [],
      tenantId: "tenant-a",
      partNumber: "PN-1",
      partName: "Pump",
      machineIds: ["m1"],
      machineNames: ["Line A"],
      lifecycle: { status: "obsolete" },
      users: [staff, customer, customerOther],
      machines: [{ id: "m1", tenantId: "tenant-a" }, { id: "m2", tenantId: "tenant-a" }],
      sites: [],
      customers: [],
      at,
    });
    assert.equal(rows.length, 2);
    const userIds = rows.map((row) => row.userId).sort();
    assert.deepEqual(userIds, ["cust-1", "staff-1"]);
    assert.equal(
      rows[0]?.dedupeKey,
      lifecycleNotificationDedupeKey("tenant-a", rows[0]!.userId, "PN-1"),
    );
  });

  it("dedupes per user per part number", () => {
    const at = "2026-10-10T12:00:00.000Z";
    const first = buildObsoleteLifecycleNotifications({
      existing: [],
      tenantId: "tenant-a",
      partNumber: "PN-1",
      partName: "Pump",
      machineIds: ["m1"],
      machineNames: ["Line A"],
      lifecycle: { status: "obsolete" },
      users: [staff],
      machines: [{ id: "m1", tenantId: "tenant-a" }],
      sites: [],
      customers: [],
      at,
    });
    const second = buildObsoleteLifecycleNotifications({
      existing: first,
      tenantId: "tenant-a",
      partNumber: "PN-1",
      partName: "Pump",
      machineIds: ["m1"],
      machineNames: ["Line A"],
      lifecycle: { status: "obsolete" },
      users: [staff],
      machines: [{ id: "m1", tenantId: "tenant-a" }],
      sites: [],
      customers: [],
      at,
    });
    assert.equal(second.length, 0);
  });
});
