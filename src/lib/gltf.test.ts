import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { extractMeshNames, isGlb } from "./gltf.ts";

const JSON_CHUNK = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;

function encodeGlb(
  json: object,
  options?: { padByte?: number; extraAfterJson?: Buffer },
) {
  const jsonUtf8 = Buffer.from(JSON.stringify(json), "utf8");
  const extra = options?.extraAfterJson ?? Buffer.alloc(0);
  const unpadded = Buffer.concat([jsonUtf8, extra]);
  const padLen = (4 - (unpadded.length % 4)) % 4;
  const pad = Buffer.alloc(padLen, options?.padByte ?? 0x20);
  const chunkData = Buffer.concat([unpadded, pad]);

  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(chunkData.length, 0);
  chunkHeader.writeUInt32LE(JSON_CHUNK, 4);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + chunkData.length, 8);

  return Buffer.concat([header, chunkHeader, chunkData]);
}

const scene = {
  nodes: [{ name: "Pump-1", mesh: 0 }],
  meshes: [{ name: "Pump" }],
};

describe("extractMeshNames GLB chunks", () => {
  it("still reads the hardware fixture", () => {
    const glb = readFileSync("public/placeholders/hardware/mcmaster-hardware.glb");
    assert.equal(isGlb(glb), true);
    const names = extractMeshNames(glb, "mcmaster-hardware.glb");
    assert.ok(names.includes("5972K325"));
  });

  it("reads a JSON chunk padded with NUL bytes (SolidWorks-style)", () => {
    const glb = encodeGlb(scene, { padByte: 0x00 });
    const naive = glb.subarray(20);
    assert.throws(
      () => JSON.parse(naive.toString("utf8")),
      /non-whitespace character after JSON/,
    );
    assert.deepEqual(extractMeshNames(glb, "cell.glb").sort(), ["Pump", "Pump-1"]);
  });

  it("ignores BIN bytes that leak into the declared JSON chunk length", () => {
    const junk = Buffer.from([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe]);
    const glb = encodeGlb(scene, { extraAfterJson: junk });
    assert.deepEqual(extractMeshNames(glb, "cell.glb").sort(), ["Pump", "Pump-1"]);
  });

  it("does not JSON.parse a full GLB when the filename says .gltf", () => {
    const glb = encodeGlb(scene, { padByte: 0x00, extraAfterJson: Buffer.from("BIN!") });
    assert.deepEqual(extractMeshNames(glb, "misnamed.gltf").sort(), ["Pump", "Pump-1"]);
  });

  it("still accepts a text .gltf", () => {
    const text = Buffer.from(JSON.stringify(scene), "utf8");
    assert.equal(isGlb(text), false);
    assert.deepEqual(extractMeshNames(text, "cell.gltf").sort(), ["Pump", "Pump-1"]);
  });
});
