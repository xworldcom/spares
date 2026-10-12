/**
 * Playwright gate through real UI (updateTicketStatus in the browser bundle).
 * Run: OEE360_BASE_URL=http://127.0.0.1:3010 RUN_CAS_CLIENT_GATE=1 npm test -- src/lib/ticket-cas-client-path.test.ts
 * Checkout f03d568 without this fix → gate fails; on fix branch → pass.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const GATE = path.join(process.cwd(), "scripts/exploratory/verify-ticket-cas-gate.mjs");

function runGate(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GATE], {
      env: { ...process.env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

describe("ticket CAS client-path gate", () => {
  it(
    "verify-ticket-cas-gate.mjs passes through UI",
    { skip: process.env.RUN_CAS_CLIENT_GATE !== "1" ? "set RUN_CAS_CLIENT_GATE=1" : false },
    async () => {
      assert.ok(process.env.OEE360_BASE_URL, "OEE360_BASE_URL required");
      const code = await runGate();
      assert.equal(code, 0);
    },
  );
});
