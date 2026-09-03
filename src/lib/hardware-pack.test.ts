import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { extractMeshNames } from "./gltf.ts";
import { joinParts, parsePartsList } from "./parts.ts";

const JOINED = [
  "5972K325",
  "6331K32",
  "6435K12",
  "91280A340",
  "91828A230",
];

describe("hardware fixture pack", () => {
  it("joins five named McMaster catalog parts and leaves the washer unmatched", () => {
    const glb = readFileSync(
      "public/placeholders/hardware/mcmaster-hardware.glb",
    );
    const list = readFileSync(
      "public/placeholders/hardware/mcmaster-hardware-parts.json",
      "utf8",
    );
    const meshNames = extractMeshNames(glb, "mcmaster-hardware.glb");
    const rows = parsePartsList(list, "mcmaster-hardware-parts.json");
    const { parts, unmatched } = joinParts(rows, meshNames);

    assert.deepEqual(meshNames.slice().sort(), JOINED);
    assert.deepEqual(parts.map((part) => part.id).sort(), JOINED);
    assert.equal(parts.find((part) => part.id === "91280A340")?.qty, 4);
    assert.equal(parts.find((part) => part.id === "91828A230")?.qty, 4);
    assert.ok(
      unmatched.some(
        (row) => row.source === "list" && row.id === "93475A240",
      ),
    );
    assert.equal(
      unmatched.filter((row) => row.source === "model").length,
      0,
    );
  });

  it("parses the CSV with the same join keys as the JSON", () => {
    const csv = readFileSync(
      "public/placeholders/hardware/mcmaster-hardware-parts.csv",
      "utf8",
    );
    const json = readFileSync(
      "public/placeholders/hardware/mcmaster-hardware-parts.json",
      "utf8",
    );
    const fromCsv = parsePartsList(csv, "mcmaster-hardware-parts.csv");
    const fromJson = parsePartsList(json, "mcmaster-hardware-parts.json");
    assert.deepEqual(fromCsv, fromJson);
  });
});
