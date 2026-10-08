import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const worker = fileURLToPath(new URL("./cas-worker.fixture.ts", import.meta.url));
const HOST = "tenant-oee360-host";

function runWorker(dir: string, tag: string, count: number) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", worker, tag, String(count)],
      {
        env: {
          ...process.env,
          SPARES_DATA_DIR: dir,
          SPARES_ALLOW_SEED: "false",
          VERCEL: "",
          BLOB_READ_WRITE_TOKEN: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

describe("separate processes sharing one data dir (real concurrency)", () => {
  it("every machine and ticket from 4 concurrent writers is kept", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "spares-cas-procs-"));
    await mkdir(path.join(dir, "files"), { recursive: true });
    await writeFile(
      path.join(dir, "db.json"),
      JSON.stringify({
        schemaVersion: 3,
        tenants: [
          { id: HOST, name: "OEE360 Host", slug: "oee360-host", createdAt: "2020-01-01T00:00:00.000Z" },
        ],
        customers: [],
        sites: [],
        users: [],
        machines: [],
        quotes: [],
        bugReports: [],
        accessInquiries: [],
        machineViews: [],
        manuals: [],
        tickets: [],
        machineUsage: [],
        partLifecycle: [],
      }),
    );

    const writers = 4;
    const each = 6;
    const results = await Promise.all(
      Array.from({ length: writers }, (_, i) => runWorker(dir, `w${i}`, each)),
    );
    for (const result of results) {
      assert.equal(result.code, 0, result.output);
    }

    const db = JSON.parse(await readFile(path.join(dir, "db.json"), "utf8")) as {
      machines: Array<{ name: string }>;
      tickets: Array<{ title: string }>;
    };
    const care = JSON.parse(await readFile(path.join(dir, "care.json"), "utf8")) as {
      tickets: Array<{ title: string }>;
    };
    const machineNames = new Set(db.machines.map((machine) => machine.name));
    const ticketTitles = new Set(db.tickets.map((ticket) => ticket.title));
    const careTitles = new Set(care.tickets.map((ticket) => ticket.title));
    const missing: string[] = [];
    for (let w = 0; w < writers; w++) {
      for (let i = 0; i < each; i++) {
        if (!machineNames.has(`w${w}-machine-${i}`)) missing.push(`machine w${w}-${i}`);
        if (!ticketTitles.has(`w${w}-ticket-${i}`)) missing.push(`db ticket w${w}-${i}`);
        if (!careTitles.has(`w${w}-ticket-${i}`)) missing.push(`care ticket w${w}-${i}`);
      }
    }
    assert.deepEqual(missing, [], `lost writes: ${missing.join(", ")}`);
    assert.equal(
      db.machines.filter((machine) => /^w\d-machine-/.test(machine.name)).length,
      writers * each,
      "no duplicates",
    );
  });
});
