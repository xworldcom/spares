import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const LEGACY_DIRECTORY_REDIRECT_PAGES: Array<{ file: string; type: string }> = [
  { file: "src/app/customers/page.tsx", type: "person" },
  { file: "src/app/team/page.tsx", type: "staff" },
  { file: "src/app/staff/customers/page.tsx", type: "person" },
  { file: "src/app/staff/team/page.tsx", type: "staff" },
];

describe("legacy directory redirect routes", () => {
  for (const { file, type } of LEGACY_DIRECTORY_REDIRECT_PAGES) {
    it(`${file} redirects into Directory type=${type}`, () => {
      const src = readFileSync(file, "utf8");
      assert.match(src, new RegExp(`directoryHref\\("${type}"\\)`));
    });
  }
});
