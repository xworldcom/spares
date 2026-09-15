import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const media = join(root, "scripts/landing-media");
const outDir = join(root, "public/landing");

const assets = [
  ["oee360-stage_mp4", "oee360-stage.mp4"],
  ["oee360-stage_jpg", "oee360-stage.jpg"],
];

mkdirSync(outDir, { recursive: true });

for (const [stem, filename] of assets) {
  const list = readFileSync(join(media, `${stem}.files`), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  const b64 = list.map((name) => readFileSync(join(media, name), "utf8").trim()).join("");
  writeFileSync(join(outDir, filename), Buffer.from(b64, "base64"));
}
