import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { loginSurfaceFlags, PASSWORD_LOGIN_DISABLED_MESSAGE } from "./password-login-public.ts";
import {
  assertPasswordLoginAllowed,
  effectivePasswordLoginEnabled,
  getSignInOptions,
  readPasswordLoginEnvOverride,
} from "./password-login.server.ts";
import { createMemoryPersistence, getPersistence, setPersistenceForTests } from "../persistence.ts";
import {
  resetStoreMemoryForTests,
  updatePlatformSignInSettings,
  writeCatalogHealForTests,
} from "../store.ts";

describe("password login policy", () => {
  const envKeys = ["PASSWORD_LOGIN"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("defaults password sign-in to enabled", () => {
    assert.equal(effectivePasswordLoginEnabled(undefined), true);
    assert.equal(effectivePasswordLoginEnabled(true), true);
  });

  it("honors stored disable before env override", () => {
    assert.equal(effectivePasswordLoginEnabled(false), false);
  });

  it("env PASSWORD_LOGIN=0 forces passwords off", () => {
    process.env.PASSWORD_LOGIN = "0";
    assert.equal(readPasswordLoginEnvOverride(), "force-off");
    assert.equal(effectivePasswordLoginEnabled(true), false);
  });

  it("env PASSWORD_LOGIN=1 forces passwords on", () => {
    process.env.PASSWORD_LOGIN = "1";
    assert.equal(readPasswordLoginEnvOverride(), "force-on");
    assert.equal(effectivePasswordLoginEnabled(false), true);
  });

  it("maps sign-in options to login surface flags", () => {
    assert.deepEqual(
      loginSurfaceFlags({ passwordLoginEnabled: true, microsoftSignInEnabled: true }),
      {
        passwordLoginEnabled: true,
        microsoftSignInEnabled: true,
        signInUnavailable: false,
      },
    );
  });
});

describe("password login API gate", () => {
  beforeEach(() => {
    setPersistenceForTests(createMemoryPersistence());
    resetStoreMemoryForTests();
  });

  after(() => {
    setPersistenceForTests(null);
    resetStoreMemoryForTests();
  });

  it("allows password login by default", async () => {
    const allowed = await assertPasswordLoginAllowed();
    assert.equal(allowed.ok, true);
    const options = await getSignInOptions();
    assert.equal(options.passwordLoginEnabled, true);
  });

  it("rejects password login when disabled in sidecar", async () => {
    await updatePlatformSignInSettings({ passwordLoginEnabled: false });
    resetStoreMemoryForTests();
    const allowed = await assertPasswordLoginAllowed();
    assert.equal(allowed.ok, false);
    if (!allowed.ok) {
      assert.equal(allowed.status, 403);
      assert.equal(allowed.message, PASSWORD_LOGIN_DISABLED_MESSAGE);
    }
    const options = await getSignInOptions();
    assert.equal(options.passwordLoginEnabled, false);
  });

  it("persists disable in platform-settings.json after memory reset", async () => {
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await updatePlatformSignInSettings({ passwordLoginEnabled: false });
    resetStoreMemoryForTests();
    const raw = await persistence.readPlatformSettingsJson();
    assert.match(raw ?? "", /"passwordLoginEnabled"\s*:\s*false/);
    const dbRaw = await persistence.readDatabaseJson();
    assert.doesNotMatch(dbRaw ?? "", /"passwordLoginEnabled"\s*:\s*false/);
    const allowed = await assertPasswordLoginAllowed();
    assert.equal(allowed.ok, false);
  });

  it("catalog heal on db.json does not clear sidecar disable", async () => {
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await updatePlatformSignInSettings({ passwordLoginEnabled: false });
    assert.equal((await getSignInOptions()).passwordLoginEnabled, false);
    const dbRaw = await persistence.readDatabaseJson();
    assert.ok(dbRaw);
    const snapshot = JSON.parse(dbRaw!) as Record<string, unknown>;
    const staleHeal = { ...snapshot };
    delete staleHeal.platformSettings;
    await writeCatalogHealForTests(staleHeal as never);
    resetStoreMemoryForTests();
    assert.match(
      (await getPersistence().readPlatformSettingsJson()) ?? "",
      /"passwordLoginEnabled"\s*:\s*false/,
    );
    assert.equal((await getSignInOptions()).passwordLoginEnabled, false);
    assert.equal((await assertPasswordLoginAllowed()).ok, false);
  });
});
