/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3 / #7 — manual quote "Add part" fields must not overprint in the narrow desktop dock. */
const h = require("./harness.cjs");

const VIEWPORTS = [
  { name: "desktop-1440", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "desktop-1024", viewport: { width: 1024, height: 800 }, mobile: false },
  { name: "phone-390", viewport: { width: 390, height: 844 }, mobile: true },
];

function overlaps(a, b) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

async function openForm(page) {
  await page.goto(h.BASE + "/machines/palletizer", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".manual-quote-add", { state: "attached", timeout: 20000 }).catch(() => undefined);
  if (!(await page.locator(".manual-quote-add:visible").count())) {
    const open = page.getByRole("button", { name: /quote|tray/i }).first();
    await open.click().catch(() => undefined);
  }
  await page.locator(".manual-quote-add:visible").first().waitFor({ timeout: 10000 });
}

(async () => {
  for (const vp of VIEWPORTS) {
    const s = await h.launch({ name: "mq-" + vp.name, viewport: vp.viewport, mobile: vp.mobile, video: vp.name === "desktop-1440" });
    await h.apiLogin(s.context);
    await openForm(s.page);
    const m = await s.page.evaluate(() => {
      const root = [...document.querySelectorAll(".manual-quote-add")].find((e) => e.offsetParent);
      const box = (el) => el.getBoundingClientRect().toJSON();
      const [part, desc, qty] = root.querySelectorAll("input");
      const btn = root.querySelector("button");
      return { part: box(part), desc: box(desc), qty: box(qty), btn: box(btn), root: box(root) };
    });
    const tag = vp.name;
    h.check(`${tag}: no field overlaps another`,
      !overlaps(m.part, m.desc) && !overlaps(m.part, m.qty) && !overlaps(m.desc, m.qty) && !overlaps(m.btn, m.desc) && !overlaps(m.btn, m.qty) && !overlaps(m.btn, m.part),
      JSON.stringify(m));
    h.check(`${tag}: description is usable (>= 150px)`, m.desc.width >= 150, `desc ${m.desc.width}`);
    h.check(`${tag}: part # is usable (>= 90px)`, m.part.width >= 90, `part ${m.part.width}`);
    h.check(`${tag}: Add part stays on one line`, m.btn.height <= 48, `btn h ${m.btn.height}`);
    h.check(`${tag}: nothing spills out of the form`, [m.part, m.desc, m.qty, m.btn].every((b) => b.right <= m.root.right + 1), "");
    await s.page.locator(".manual-quote-add:visible").first().scrollIntoViewIfNeeded();
    await s.page.screenshot({ path: `${h.OUT}/${h.TAG}-manual-quote-${tag}.png` });
    await h.finish(s, "manual-quote-" + tag);
  }
  h.writeProof("manual-quote-grid");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
