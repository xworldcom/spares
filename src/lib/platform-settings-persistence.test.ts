import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  readPersistedPlatformSettings,
  writePersistedPlatformSettings,
  writePersistedPlatformSignInSettings,
} from "./platform-settings-persistence.ts";

describe("platform settings sidecar", () => {
  it("keeps sign-in and assistant fields on the same document", async () => {
    setPersistenceForTests(createMemoryPersistence());
    await writePersistedPlatformSignInSettings({ passwordLoginEnabled: false });
    await writePersistedPlatformSettings({
      assistantEnabled: true,
      assistantModel: "google/gemini-3.8-flash",
    });
    const doc = await readPersistedPlatformSettings();
    assert.equal(doc?.passwordLoginEnabled, false);
    assert.equal(doc?.assistantEnabled, true);
    assert.equal(doc?.assistantModel, "google/gemini-3.8-flash");
    setPersistenceForTests(null);
  });
});
