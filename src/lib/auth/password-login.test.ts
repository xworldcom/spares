import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import {
  assertPasswordLoginAllowed,
  effectivePasswordLoginEnabled,
  getSignInOptions,
  loginSurfaceFlags,
  PASSWORD_LOGIN_DISABLED_MESSAGE,
  readPasswordLoginEnvOverride,
} from "./password-login.ts";
import { createMemoryPersistence, setPersistenceForTests } from "../persistence.ts";
import { resetStoreMemoryForTests, updatePlatformSignInSettings } from "../store.ts";

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
    assert.deepEqual(
      loginSurfaceFlags({ passwordLoginEnabled: false, microsoftSignInEnabled: true }),
      {
        passwordLoginEnabled: false,
        microsoftSignInEnabled: true,
        signInUnavailable: false,
      },
    );
    assert.deepEqual(
      loginSurfaceFlags({ passwordLoginEnabled: false, microsoftSignInEnabled: false }),
      {
        passwordLoginEnabled: false,
        microsoftSignInEnabled: false,
        signInUnavailable: true,
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

  it("rejects password login when disabled in catalog", async () => {
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
});
