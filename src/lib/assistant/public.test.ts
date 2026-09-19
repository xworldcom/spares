import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { setPersistenceForTests } from "../persistence.ts";
import { resetStoreMemoryForTests, updatePlatformAssistantSettings } from "../store.ts";
import { attachStaffAssistantAvailability } from "./public.ts";

async function isolatedDataDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-assistant-public-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "true";
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("attachStaffAssistantAvailability", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("tells staff when the platform switch is on", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: true });
    const staff = await attachStaffAssistantAvailability(
      { role: "staff" },
      { id: "t1" },
    );
    assert.equal(staff.assistantAvailable, true);
    const customer = await attachStaffAssistantAvailability(
      { role: "customer" },
      { id: "t1" },
    );
    assert.equal(customer.assistantAvailable, undefined);
  });

  it("stays off for staff when the platform switch is off", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: false });
    const staff = await attachStaffAssistantAvailability(
      { role: "staff" },
      { id: "t1" },
    );
    assert.equal(staff.assistantAvailable, false);
  });
});
