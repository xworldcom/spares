/* eslint-disable @typescript-eslint/no-require-imports */
const h = require("./harness.cjs");

const HARDWARE_ID = "hardware-fixture";

async function ringDiff(page, a, b) {
  return page.evaluate(
    async ([x, y]) => {
      const load = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      const w = ia.width;
      const hgt = ia.height;
      const grab = (img) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = hgt;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, hgt).data;
      };
      const da = grab(ia);
      const db = grab(ib);
      const ring = Math.round(Math.min(w, hgt) * 0.03);
      let diff = 0;
      let total = 0;
      for (let py = 0; py < hgt; py++) {
        for (let px = 0; px < w; px++) {
          const inRing = px < ring || py < ring || px >= w - ring || py >= hgt - ring;
          if (!inRing) continue;
          total++;
          const i = (py * w + px) * 4;
          if (
            Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) >
            60
          ) {
            diff++;
          }
        }
      }
      return diff / total;
    },
    [a, b],
  );
}

async function main() {
  const run = await h.launch({ name: "explode-bounds" });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    await page.goto(`${h.BASE}/machines/${HARDWARE_ID}`, { waitUntil: "domcontentloaded" });
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(3000);
    const shot = async (name) => {
      const buf = await canvas.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-${name}.png`) });
      return "data:image/png;base64," + buf.toString("base64");
    };
    const assembled = await shot("explode-0");

    const slider = page.locator(".explode-slider");
    const box = await slider.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 4, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(2500);
    const exploded = await shot("explode-75");
    const frac = await ringDiff(page, assembled, exploded);
    h.check("exploded 75% stays inside the viewport ring", frac < 0.002, `ringDiff=${frac.toFixed(4)}`);
  } finally {
    await h.finish(run);
  }
  if (h.checks.some((c) => !c.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
