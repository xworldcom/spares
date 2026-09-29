import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOTS = ["src/app", "src/components"];
const SKIP = /\/dev\//;
const INTERNAL = /\bT1\.\d\b|seen all the way around|chapter below/;

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, out);
      continue;
    }
    if (path.endsWith(".tsx") && !SKIP.test(path)) {
      out.push(path);
    }
  }
  return out;
}

describe("user-facing copy", () => {
  it("keeps internal milestone language out of the app", () => {
    const hits: string[] = [];
    for (const file of ROOTS.flatMap((root) => walk(root))) {
      const text = readFileSync(file, "utf8");
      if (INTERNAL.test(text)) {
        hits.push(file);
      }
    }
    assert.deepEqual(hits, []);
  });
});
