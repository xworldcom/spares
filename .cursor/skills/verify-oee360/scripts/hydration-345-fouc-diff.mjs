#!/usr/bin/env node
/**
 * Header-band max channel diff (≤24/255) between before/after FOUC stills.
 * Usage: node hydration-345-fouc-diff.mjs <outDir> <tag> <frame>
 * e.g. fouc-diff.mjs ... 1440 100ms
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const outDir = process.argv[2];
const tag = process.argv[3];
const frame = process.argv[4];
const maxDelta = Number(process.argv[5] ?? "24");
const headerPx = tag === "390" ? 64 : 72;

const beforePath = join(outDir, `before-fouc-${tag}-${frame}.png`);
const afterPath = join(outDir, `after-fouc-${tag}-${frame}.png`);

function cropHeader(png, h) {
  const out = new PNG({ width: png.width, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      const o = i;
      out.data[o] = png.data[i];
      out.data[o + 1] = png.data[i + 1];
      out.data[o + 2] = png.data[i + 2];
      out.data[o + 3] = png.data[i + 3];
    }
  }
  return out;
}

function maxChannelDelta(a, b) {
  let max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    max = Math.max(
      max,
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
  }
  return max;
}

const a = cropHeader(PNG.sync.read(readFileSync(beforePath)), headerPx);
const b = cropHeader(PNG.sync.read(readFileSync(afterPath)), headerPx);
if (a.width !== b.width || a.height !== b.height) {
  console.log(JSON.stringify({ ok: false, reason: "dimension_mismatch" }));
  process.exit(1);
}
const delta = maxChannelDelta(a, b);
const ok = delta <= maxDelta;
console.log(JSON.stringify({ ok, tag, frame, headerPx, maxChannelDelta: delta, threshold: maxDelta }));
process.exit(ok ? 0 : 1);
