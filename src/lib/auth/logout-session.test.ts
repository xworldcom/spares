import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  sessionMatchesUserStamp,
  signSession,
  verifySession,
} from "./session-token.ts";
import {
  findUserByEmail,
  revokeUserSessions,
  resetStoreMemoryForTests,
} from "../store.ts";
import { createMemoryPersistence, setPersistenceForTests } from "../persistence.ts";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-logout-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "true";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("logout session revocation", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("bumps sessionStamp so old cookies no longer match", async () => {
    await isolated();
    const user = await findUserByEmail("customer@spares.local");
    assert.ok(user);
    const token = signSession(user!.id, user!.email, user!.tenantId, 0);
    const session = verifySession(token);
    assert.ok(session);
    assert.equal(sessionMatchesUserStamp(session!, user!), true);

    const revoked = await revokeUserSessions(user!.id);
    assert.ok("user" in revoked);
    const reloaded = await findUserByEmail("customer@spares.local");
    assert.ok(reloaded);
    assert.equal(reloaded!.sessionStamp, 1);
    assert.equal(sessionMatchesUserStamp(session!, reloaded!), false);
  });

  it("round-trips stamp in signed session payload", () => {
    const token = signSession("user-1", "a@b.co", "tenant-1", 4);
    const session = verifySession(token);
    assert.ok(session);
    assert.equal(session!.stamp, 4);
  });
});
