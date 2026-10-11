#!/usr/bin/env node
/**
 * Persist a one-shot catalog heal (when catalogHealDeferredV1 is set). Local/dev only.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "node",
  ["--experimental-strip-types", "--input-type=module", "-e", `
    import { createMemoryPersistence, setPersistenceForTests } from "./src/lib/persistence.ts";
    import { resetStoreMemoryForTests, readDatabase, writeDatabase } from "./src/lib/store.ts";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    const db = await readDatabase();
    const healed = { ...db, dataMigrations: { ...db.dataMigrations, catalogHealDeferredV1: undefined } };
    await writeDatabase(healed);
    console.log(JSON.stringify({ ok: true }));
  `],
  { stdio: "inherit", cwd: process.cwd() },
);

process.exit(result.status ?? 1);
