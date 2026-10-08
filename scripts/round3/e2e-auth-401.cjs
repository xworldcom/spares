/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3 / #5 + #8 — session loss anywhere → /login "You were signed out"; no signed-out flash on F5. */
const h = require("./harness.cjs");

const FLASH_SCRIPT = () => {
  window.__flash = [];
  const scan = () => {
    const text = document.body ? document.body.innerText : "";
    if (/Request access/i.test(text)) window.__flash.push("Request access");
    if (/Checking your session/i.test(text)) window.__flash.push("Checking your session");
    if (document.body && Array.from(document.querySelectorAll("a")).some((a) => a.textContent.trim() === "Sign in"))
      window.__flash.push("Sign in link");
  };
  new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener("DOMContentLoaded", scan);
};

(async () => {
  const session = await h.launch({ name: "auth-401" });
  const { context, page, browser } = session;
  await h.apiLogin(context);
  const ticket = await h.seedTicket(context, "palletizer", "R3 auth probe " + Date.now(), "Probe note", ["First reply"]);
  await context.addInitScript(FLASH_SCRIPT);

  // #8: F5 while signed in must never paint a signed-out header.
  await page.goto(h.BASE + "/machines/palletizer", { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const flash = await page.evaluate(() => Array.from(new Set(window.__flash ?? [])));
  h.check("F5 signed in: no signed-out/checking flash", flash.length === 0, JSON.stringify(flash));

  // #5: revoke the session from another browser, then use the open page.
  await page.goto(h.BASE + `/care/tickets/${ticket.number ?? ticket.id}`, { waitUntil: "domcontentloaded" });
  const other = await browser.newContext();
  const login = await other.request.post(h.BASE + "/api/auth/login", { data: h.CUSTOMER });
  if (!login.ok()) throw new Error("second login failed");
  await other.request.post(h.BASE + "/api/auth/logout");
  await other.close();

  const composer = page.locator("textarea").last();
  await composer.waitFor({ timeout: 15000 });
  await composer.fill("Reply after logout");
  await page.keyboard.press("Enter").catch(() => undefined);
  const send = page.getByRole("button", { name: /^send/i }).first();
  if (await send.isVisible().catch(() => false)) await send.click().catch(() => undefined);
  await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => undefined);
  const url = page.url();
  h.check("reply after logout redirects to /login", /\/login/.test(url), url);
  h.check("login url carries next + reason", /next=/.test(url) && /reason=signed-out/.test(url), url);
  const body = await page.locator("body").innerText();
  h.check("shows 'You were signed out'", /You were signed out/i.test(body));
  h.check("no raw Unauthorized text", !/^Unauthorized$/m.test(body) && !/Unauthorized/.test(body));
  h.check("no Sign out button", (await page.getByRole("button", { name: /sign out/i }).count()) === 0);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-auth-401-login.png` });

  // idle tab: log in again, revoke elsewhere, focus event alone must redirect.
  await h.apiLogin(context);
  await page.goto(h.BASE + "/machines/palletizer", { waitUntil: "networkidle" });
  const other2 = await browser.newContext();
  await other2.request.post(h.BASE + "/api/auth/login", { data: h.CUSTOMER });
  await other2.request.post(h.BASE + "/api/auth/logout");
  await other2.close();
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => undefined);
  h.check("idle tab on focus redirects to /login", /\/login/.test(page.url()), page.url());

  h.writeProof("auth-401", { flash });
  await h.finish(session, "auth-401");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
