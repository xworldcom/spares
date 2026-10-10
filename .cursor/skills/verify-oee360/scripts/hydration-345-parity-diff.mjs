#!/usr/bin/env node
/** Pixel diff two PNGs; exit 1 if mismatch ratio > threshold. */
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const [leftPath, rightPath, thresholdArg] = process.argv.slice(2);
const threshold = Number(thresholdArg ?? "0.002");

const a = PNG.sync.read(readFileSync(leftPath));
const b = PNG.sync.read(readFileSync(rightPath));
if (a.width !== b.width || a.height !== b.height) {
  console.log(
    JSON.stringify({
      ok: false,
      reason: "dimension_mismatch",
      left: { w: a.width, h: a.height },
      right: { w: b.width, h: b.height },
    }),
  );
  process.exit(1);
}
let diff = 0;
const pixels = a.width * a.height;
for (let i = 0; i < a.data.length; i += 4) {
  if (
    Math.abs(a.data[i] - b.data[i]) > 2 ||
    Math.abs(a.data[i + 1] - b.data[i + 1]) > 2 ||
    Math.abs(a.data[i + 2] - b.data[i + 2]) > 2 ||
    Math.abs(a.data[i + 3] - b.data[i + 3]) > 2
  ) {
    diff += 1;
  }
}
const ratio = diff / pixels;
const ok = ratio <= threshold;
console.log(JSON.stringify({ ok, ratio, diffPixels: diff, totalPixels: pixels, threshold }));
process.exit(ok ? 0 : 1);
