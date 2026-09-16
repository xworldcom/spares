import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  canManageAccessInquiries,
  parseAccessInquiryBody,
} from "./access-inquiry.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createAccessInquiry,
  countNewAccessInquiries,
  listAccessInquiries,
  resetStoreMemoryForTests,
  updateAccessInquiryStatus,
} from "./store.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-inquiry-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("platform access inquiry ACL + persistence", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
  });

  it("limits queue management to platform owner emails", () => {
    process.env.SPARES_PLATFORM_OWNER_EMAILS = "kevin@example.com";
    assert.equal(canManageAccessInquiries("kevin@example.com"), true);
    assert.equal(canManageAccessInquiries("staff@host.com"), false);
  });

  it("stores inquiries in the platform catalog without creating users", async () => {
    await isolated();
    const parsed = parseAccessInquiryBody({
      fullName: "Sam Ortiz",
      workEmail: "sam@fabco.com",
      phone: "555-0199",
      companyName: "FabCo",
      website: "",
      roleTitle: "Plant manager",
      scaleNotes: "",
      customerType: "end_customer",
      message: "Looking for a private spare parts portal.",
      referralNotes: "",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }

    await createAccessInquiry({ ...parsed.value, submitterIp: "203.0.113.4" });
    const rows = await listAccessInquiries();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "new");
    assert.equal(await countNewAccessInquiries(), 1);

    const updated = await updateAccessInquiryStatus(rows[0]!.id, "accepted");
    assert.ok(updated);
    assert.equal(updated?.status, "accepted");
    assert.equal(await countNewAccessInquiries(), 0);
  });
});
