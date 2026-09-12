import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  extractMeshNames,
  isGlb,
  normalizeGlb,
} from "./gltf.ts";

const JSON_CHUNK = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;

function encodeGlb(
  json: object,
  options?: { padByte?: number; extraAfterJson?: Buffer; bin?: Buffer },
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

  const parts = [chunkHeader, chunkData];
  if (options?.bin?.length) {
    const binPadLen = (4 - (options.bin.length % 4)) % 4;
    const binData = Buffer.concat([
      options.bin,
      Buffer.alloc(binPadLen, 0x00),
    ]);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binData.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    parts.push(binHeader, binData);
  }

  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);

  return Buffer.concat([header, body]);
}

function jsonChunkData(glb: Buffer) {
  let offset = 12;
  const chunkLength = glb.readUInt32LE(offset);
  const chunkType = glb.readUInt32LE(offset + 4);
  assert.equal(chunkType, JSON_CHUNK);
  return glb.subarray(offset + 8, offset + 8 + chunkLength);
}

function parseJsonChunkLikeThree(glb: Buffer) {
  return JSON.parse(jsonChunkData(glb).toString("utf8"));
}

function extractBinChunk(glb: Buffer): Buffer | undefined {
  let offset = 12;
  while (offset + 8 <= glb.length) {
    const chunkLength = glb.readUInt32LE(offset);
    const chunkType = glb.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkType === 0x004e4942) {
      return glb.subarray(offset, offset + chunkLength);
    }
    offset += chunkLength;
  }
  return undefined;
}

function dirtyGlbFromValid(valid: Buffer) {
  const json = parseJsonChunkLikeThree(valid);
  return encodeGlb(json, {
    padByte: 0x00,
    extraAfterJson: Buffer.from([0x00]),
    bin: extractBinChunk(valid),
  });
}

async function parseGlbLikeThreeLoader(glb: Buffer) {
  const loader = new GLTFLoader();
  const arrayBuffer = glb.buffer.slice(
    glb.byteOffset,
    glb.byteOffset + glb.byteLength,
  );
  return loader.parseAsync(arrayBuffer, "");
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

  it("includes SolidWorks component parents of Body1 mesh nodes", () => {
    const glb = encodeGlb({
      nodes: [
        { name: "Scene", children: [1, 3] },
        { name: "PN-100-1", children: [2] },
        { name: "Body1", mesh: 0 },
        { name: "PN-100-2", children: [4] },
        { name: "Body1", mesh: 1 },
      ],
      meshes: [{ name: "Body1" }, { name: "Body1" }],
    });
    const names = extractMeshNames(glb, "cell.glb");
    assert.ok(names.includes("PN-100-1"));
    assert.ok(names.includes("PN-100-2"));
    assert.ok(names.includes("Body1"));
    assert.equal(names.includes("Scene"), false);
  });
});

describe("normalizeGlb", () => {
  it("rewrites NUL-padded JSON chunks to space padding for three.js", () => {
    const glb = encodeGlb(scene, { padByte: 0x00 });
    assert.throws(
      () => parseJsonChunkLikeThree(glb),
      /non-whitespace character after JSON/,
    );

    const clean = normalizeGlb(glb);
    assert.notEqual(clean, glb);
    assert.deepEqual(parseJsonChunkLikeThree(clean), scene);
    assert.ok(
      jsonChunkData(clean)
        .subarray(jsonChunkData(clean).length - 4)
        .every((byte) => byte === 0x20 || byte !== 0x00),
    );
    assert.deepEqual(extractMeshNames(clean, "cell.glb").sort(), ["Pump", "Pump-1"]);
  });

  it("strips BIN bytes that leaked into the declared JSON chunk length", () => {
    const junk = Buffer.from([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe]);
    const glb = encodeGlb(scene, { extraAfterJson: junk });
    assert.throws(
      () => parseJsonChunkLikeThree(glb),
      /non-whitespace character after JSON/,
    );

    const clean = normalizeGlb(glb);
    assert.deepEqual(parseJsonChunkLikeThree(clean), scene);
    assert.deepEqual(extractMeshNames(clean, "cell.glb").sort(), ["Pump", "Pump-1"]);
  });

  it("is idempotent and leaves already-valid GLBs unchanged", () => {
    const glb = encodeGlb(scene, { padByte: 0x20 });
    const once = normalizeGlb(glb);
    assert.equal(once, glb);
    assert.equal(normalizeGlb(once), once);
    assert.deepEqual(parseJsonChunkLikeThree(glb), scene);
  });

  it("parses through three.js GLTFLoader after normalizing SolidWorks-style padding", async () => {
    const valid = readFileSync("public/placeholders/hardware/mcmaster-hardware.glb");
    const dirty = dirtyGlbFromValid(valid);
    assert.throws(
      () => parseJsonChunkLikeThree(dirty),
      /non-whitespace character after JSON/,
    );

    const clean = normalizeGlb(dirty);
    const parsed = await parseGlbLikeThreeLoader(clean);
    assert.ok(parsed.scene);
    assert.ok(parsed.parser.json.meshes?.length);
  });

  it("keeps a trailing BIN chunk intact", () => {
    const bin = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const glb = encodeGlb(scene, { padByte: 0x00, bin });
    const clean = normalizeGlb(glb);
    assert.equal(clean.length, glb.length - (jsonChunkData(glb).length - jsonChunkData(clean).length));
    assert.deepEqual(extractMeshNames(clean, "cell.glb").sort(), ["Pump", "Pump-1"]);
  });
});
