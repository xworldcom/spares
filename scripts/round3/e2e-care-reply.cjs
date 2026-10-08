/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3 / #6 — replying in a long ticket keeps the thread on the new message with a visible "Sending…" bubble. */
const h = require("./harness.cjs");

const info = (page) =>
  page.evaluate(() => {
    const ol = document.querySelector("ol.imsg-thread");
    if (!ol) return null;
    const rect = ol.getBoundingClientRect();
    const last = ol.lastElementChild?.getBoundingClientRect();
    return {
      top: Math.round(ol.scrollTop),
      max: Math.round(ol.scrollHeight - ol.clientHeight),
      lastVisible: last ? last.bottom > rect.top && last.top < rect.bottom : false,
      pending: Boolean(ol.querySelector(".imsg-pending")),
      lastText: ol.lastElementChild?.textContent?.slice(0, 40),
    };
  });

async function run(name, { mobile }) {
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const s = await h.launch({ name, viewport, mobile });
  const { context, page } = s;
  await h.apiLogin(context);
  const replies = Array.from({ length: 14 }, (_, i) => `Seed message ${i + 1} — long enough text to occupy vertical room in the thread.`);
  const t = await h.seedTicket(context, "palletizer", `R3 reply ${name} ${Date.now()}`, "note", replies);
  await page.route("**/api/tickets/*/activity", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1800));
    await route.continue();
  });
  await page.goto(h.BASE + `/care/tickets/${t.number}`, { waitUntil: "domcontentloaded" });
  const ta = page.locator("textarea").last();
  await ta.waitFor();
  await page.waitForTimeout(2500);
  await ta.fill("Reply from buyer " + Date.now());
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const during = await info(page);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-care-reply-${name}-sending.png` });
  h.check(`${name}: Sending… bubble is in view while the request is slow`, during?.pending && during.lastVisible, JSON.stringify(during));
  if (!mobile) h.check(`${name}: thread stays at the bottom (no jump to top)`, during && during.max - during.top <= 4, JSON.stringify(during));
  await page.waitForTimeout(2600);
  const after = await info(page);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-care-reply-${name}-sent.png` });
  h.check(`${name}: sent message in view, not pending`, after && !after.pending && after.lastVisible, JSON.stringify(after));
  if (!mobile) h.check(`${name}: still at bottom after send`, after && after.max - after.top <= 4, JSON.stringify(after));
  await h.finish(s, name);
}

(async () => {
  await run("care-reply-desktop", { mobile: false });
  await run("care-reply-phone", { mobile: true });
  h.writeProof("care-reply");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
