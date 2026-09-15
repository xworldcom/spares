import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/landing");
const required = ["oee360-stage.mp4", "oee360-stage.jpg"];

mkdirSync(outDir, { recursive: true });

const missing = required.filter((name) => !existsSync(join(outDir, name)));
if (missing.length === 0) {
  console.log("[landing-media] ok:", required.join(", "));
  process.exit(0);
}

console.error(
  "[landing-media] Missing committed wallpaper under public/landing/:",
  missing.join(", "),
);
console.error(
  "Encode Kevin's login loop to oee360-stage.mp4 (+ poster jpg) and commit them.",
);
process.exit(1);
