/**
 * rv421 sam-close-ticket9 — Care ticket #9 Messages close @390 via /care/tickets/…
 *
 *   BASE_URL=http://localhost:3000 node scripts/rv421-sam-close-ticket9.mjs
 */
import { chromium, devices } from "playwright";

const base = process.env.BASE_URL || "http://localhost:3000";
const staff = { email: "staff@spares.local", password: "SparesStaff1!" };

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

const login = await page.request.post(`${base}/api/auth/login`, {
  data: staff,
});
if (!login.ok()) {
  console.error("login failed", login.status(), await login.text());
  process.exit(1);
}

await page.goto(`${base}/care/tickets`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByRole("heading", { name: /tickets/i }).waitFor({ timeout: 30_000 });

const ticketRow = page.locator("a, button").filter({ hasText: /\b9\b/ }).first();
await ticketRow.click();
await page.waitForURL(/\/care\/tickets\//, { timeout: 30_000 });

const handle = page.locator(".snap-sheet-handle").first();
await handle.waitFor({ state: "visible", timeout: 20_000 });

const sheet = page.locator("[data-conversation-sheet]").first();
const before = await sheet.getAttribute("data-snap");

await page.getByRole("button", { name: "Close" }).click();
await page.waitForFunction(
  (prev) => {
    const card = document.querySelector("[data-conversation-sheet]");
    return card && card.getAttribute("data-snap") !== prev;
  },
  before,
  { timeout: 10_000 },
);

const after = await sheet.getAttribute("data-snap");
const ok = after === "peek" || after === "out";
console.log(
  JSON.stringify(
    {
      ok,
      path: page.url(),
      snapBefore: before,
      snapAfter: after,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(ok ? 0 : 1);
